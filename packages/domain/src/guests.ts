import type { AuditActor, Guest, GuestPatch, NewGuestBody } from '@orbit/shared';
import { DomainError } from './errors';
import type { Repositories } from './repositories';
import { normalizeText } from './text';

/**
 * Throws if another guest already has this email. The inbox recognises returning guests by
 * email, so two records with one address would make that ambiguous.
 */
export function assertUniqueGuestEmail(guests: Guest[], email: string | null, exceptId?: string) {
  if (!email) return;
  const key = normalizeText(email);
  const taken = guests.find((g) => g.id !== exceptId && g.email && normalizeText(g.email) === key);
  if (taken) throw new DomainError('conflict', `${email} already belongs to ${taken.name}`);
}

export interface GuestDeps {
  repos: Repositories;
  newId: (prefix: string) => string;
}

/** Guest records created and edited by staff. Every change is audited with the guest as subject. */
export function createGuestService({ repos, newId }: GuestDeps) {
  /** The profile `patch` would leave and the fields it changes; nothing is saved. */
  async function planUpdate(r: Repositories, id: string, patch: GuestPatch) {
    const guest = await r.guests.getGuest(id);
    if (!guest) throw new DomainError('not_found', `Guest ${id} not found`);
    const updated: Guest = { ...guest, ...patch };
    const changed = (Object.keys(patch) as (keyof GuestPatch)[]).filter(
      (key) => guest[key] !== updated[key],
    );
    if (changed.includes('email')) {
      assertUniqueGuestEmail(await r.guests.listGuests(), updated.email, id);
    }
    return { guest, updated, changed };
  }

  return {
    async create(input: NewGuestBody, actor: AuditActor): Promise<Guest> {
      return repos.transaction(async (tx) => {
        assertUniqueGuestEmail(await tx.guests.listGuests(), input.email);
        const guest: Guest = { id: newId('gst'), ...input };
        await tx.guests.createGuest(guest);
        await tx.audit.append({
          actor,
          action: 'guest.create',
          subjectId: guest.id,
          payload: null,
        });
        return guest;
      });
    },

    /** Checks an edit without saving it, e.g. for an agent proposal. */
    async previewUpdate(id: string, patch: GuestPatch) {
      const plan = await planUpdate(repos, id, patch);
      if (plan.changed.length === 0) throw new DomainError('invalid_input', 'Nothing to change');
      return plan;
    },

    async update(id: string, patch: GuestPatch, actor: AuditActor): Promise<Guest> {
      return repos.transaction(async (tx) => {
        const { guest, updated, changed } = await planUpdate(tx, id, patch);
        if (changed.length === 0) return guest;
        await tx.guests.updateGuest(updated);
        await tx.audit.append({
          actor,
          action: 'guest.update',
          subjectId: id,
          payload: { changed },
        });
        return updated;
      });
    },
  };
}

export type GuestService = ReturnType<typeof createGuestService>;
