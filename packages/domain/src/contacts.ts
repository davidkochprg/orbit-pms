import {
  type AuditActor,
  type Booking,
  type Contact,
  type ContactBody,
  contactBodySchema,
  type ContactProposal,
  type Guest,
  type HousekeepingTask,
  type IsoDate,
  type Repair,
  type RoomAccess,
  type Trade,
} from '@orbit/shared';
import { blocksRoom } from './availability';
import { hotelToday } from './dates';
import { DomainError } from './errors';
import type { Repositories } from './repositories';

/**
 * The contacts for a trade, the one last asked to fix something of that trade first, then by
 * name. None without a trade.
 */
export function contactsForTrade(
  trade: Trade | null,
  contacts: Contact[],
  tasks: HousekeepingTask[],
): Contact[] {
  if (!trade) return [];
  const lastAsked = new Map<string, string>();
  for (const t of tasks) {
    if (t.trade !== trade || !t.contactId) continue;
    const seen = lastAsked.get(t.contactId);
    if (!seen || t.createdAt > seen) lastAsked.set(t.contactId, t.createdAt);
  }
  return contacts
    .filter((c) => c.trades.includes(trade))
    .sort(
      (a, b) =>
        (lastAsked.get(b.id) ?? '').localeCompare(lastAsked.get(a.id) ?? '') ||
        a.name.localeCompare(b.name),
    );
}

/**
 * When someone can work in the room without disturbing a guest: from today, or from the day the
 * guests in it leave (back-to-back stays count as one), until the next guest arrives.
 */
export function roomAccess(
  roomId: string,
  bookings: Booking[],
  guests: Pick<Guest, 'id' | 'name'>[],
  today: IsoDate,
  now: Date,
): RoomAccess {
  const stays = bookings
    .filter((b) => b.roomId === roomId && blocksRoom(b, now) && b.checkOut > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const tonight = stays.find((b) => b.checkIn <= today);
  let freeFrom = today;
  for (const stay of stays) {
    if (stay.checkIn <= freeFrom && stay.checkOut > freeFrom) freeFrom = stay.checkOut;
  }
  return {
    guestName: tonight ? (guests.find((g) => g.id === tonight.guestId)?.name ?? 'Guest') : null,
    freeFrom,
    freeUntil: stays.find((b) => b.checkIn >= freeFrom)?.checkIn ?? null,
  };
}

/** A proposed contact as it would be saved: the saved one with what the proposal changes. */
export function contactFromProposal(
  saved: Contact | null,
  { contactId: _, ...proposal }: ContactProposal,
  hotelLanguage: Contact['language'],
): ContactBody {
  const fields = Object.fromEntries(
    Object.entries(proposal).filter(([, value]) => value !== undefined),
  );
  const base = saved
    ? {
        name: saved.name,
        person: saved.person,
        trades: saved.trades,
        phone: saved.phone,
        email: saved.email,
        language: saved.language,
        notes: saved.notes,
      }
    : { person: null, phone: null, email: null, language: hotelLanguage, notes: null };
  const parsed = contactBodySchema.safeParse({ ...base, ...fields });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainError(
      'invalid_input',
      issue ? `${issue.path.join('.') || 'contact'}: ${issue.message}` : 'Invalid contact',
    );
  }
  return parsed.data;
}

export interface ContactDeps {
  repos: Repositories;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/** Suppliers and contractors, and asking one of them to fix a repair. Changes are audited. */
export function createContactService({ repos, clock, newId }: ContactDeps) {
  async function load(tx: Repositories, id: string): Promise<Contact> {
    const contact = await tx.contacts.get(id);
    if (!contact) throw new DomainError('not_found', `Contact ${id} not found`);
    return contact;
  }

  async function loadRepairTask(tx: Repositories, taskId: string): Promise<HousekeepingTask> {
    const task = await tx.housekeeping.getTask(taskId);
    if (!task) throw new DomainError('not_found', `Task ${taskId} not found`);
    if (task.type !== 'maintenance') {
      throw new DomainError('invalid_input', 'Only a repair task has someone to fix it');
    }
    return task;
  }

  return {
    list: () => repos.contacts.list(),

    get: (id: string) => load(repos, id),

    create(body: ContactBody, actor: AuditActor): Promise<Contact> {
      return repos.transaction(async (tx) => {
        const contact: Contact = { id: newId('ct'), ...body };
        await tx.contacts.save(contact);
        await tx.audit.append({
          actor,
          action: 'contact.create',
          subjectId: contact.id,
          payload: contact,
        });
        return contact;
      });
    },

    update(id: string, body: ContactBody, actor: AuditActor): Promise<Contact> {
      return repos.transaction(async (tx) => {
        const before = await load(tx, id);
        const contact: Contact = { id, ...body };
        await tx.contacts.save(contact);
        await tx.audit.append({
          actor,
          action: 'contact.update',
          subjectId: id,
          payload: { before, after: contact },
        });
        return contact;
      });
    },

    remove(id: string, actor: AuditActor): Promise<void> {
      return repos.transaction(async (tx) => {
        const contact = await load(tx, id);
        await tx.contacts.delete(id);
        await tx.audit.append({
          actor,
          action: 'contact.remove',
          subjectId: id,
          payload: contact,
        });
      });
    },

    /** Who can fix a repair, who was asked, and when they can get into the room. */
    async repair(taskId: string): Promise<Repair> {
      const task = await loadRepairTask(repos, taskId);
      const now = clock();
      const [room, contacts, tasks, bookings, guests] = await Promise.all([
        repos.rooms.getRoom(task.roomId),
        repos.contacts.list(),
        repos.housekeeping.listTasks(),
        repos.bookings.listBookings({ roomId: task.roomId }),
        repos.guests.listGuests(),
      ]);
      return {
        task,
        roomName: room?.name ?? task.roomId,
        access: roomAccess(task.roomId, bookings, guests, hotelToday(now), now),
        contacts: contactsForTrade(task.trade, contacts, tasks),
        contact: contacts.find((c) => c.id === task.contactId) ?? null,
      };
    },

    /**
     * Records that a contact was asked to fix a repair, by phone or email, and starts the task.
     * They come first for the task's trade next time; a task without one takes the contact's.
     */
    askToRepair(taskId: string, contactId: string, actor: AuditActor): Promise<HousekeepingTask> {
      return repos.transaction(async (tx) => {
        const task = await loadRepairTask(tx, taskId);
        const contact = await load(tx, contactId);
        if (task.status === 'done') {
          throw new DomainError('invalid_transition', 'This repair is already done');
        }
        const updated: HousekeepingTask = {
          ...task,
          contactId,
          trade: task.trade ?? contact.trades[0] ?? null,
          status: 'in_progress',
        };
        await tx.housekeeping.updateTask(updated);
        await tx.audit.append({
          actor,
          action: 'task.contact',
          subjectId: task.roomId,
          payload: { taskId, contactId, contactName: contact.name, issue: task.notes },
        });
        return updated;
      });
    },
  };
}

export type ContactService = ReturnType<typeof createContactService>;
