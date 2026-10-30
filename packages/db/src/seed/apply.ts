import type { Db } from '../client';
import {
  auditLog,
  bookings,
  charges,
  contacts,
  guests,
  hotelProfile,
  housekeepingTasks,
  inboxMessages,
  inquiries,
  payments,
  pendingActions,
  pricing,
  idScans,
  rooms,
  roomTypes,
  staff,
  stayGuests,
  stayReadings,
  localEvents,
  mailAttachments,
  mailDrafts,
  mailLabels,
} from '../schema';
import type { SeedData } from './build';

/** Replaces all data with the given seed, in one transaction. */
export async function applySeed(db: Db, seed: SeedData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(pendingActions);
    await tx.delete(mailDrafts);
    await tx.delete(mailLabels);
    await tx.delete(mailAttachments);
    await tx.delete(idScans);
    await tx.delete(stayReadings);
    await tx.delete(localEvents);
    await tx.delete(contacts);
    await tx.delete(stayGuests);
    await tx.delete(charges);
    await tx.delete(payments);
    await tx.delete(auditLog);
    await tx.delete(housekeepingTasks);
    await tx.delete(inquiries);
    await tx.delete(bookings);
    await tx.delete(guests);
    await tx.delete(rooms);
    await tx.delete(roomTypes);
    await tx.delete(hotelProfile);
    await tx.delete(pricing);
    await tx.delete(staff);

    await tx.insert(roomTypes).values(seed.roomTypes);
    await tx.insert(rooms).values(seed.rooms);
    await tx.insert(guests).values(seed.guests);
    await tx.insert(bookings).values(
      seed.bookings.map((b) => ({
        ...b,
        holdExpiresAt: b.holdExpiresAt ? new Date(b.holdExpiresAt) : null,
      })),
    );
    await tx
      .insert(charges)
      .values(seed.charges.map((c) => ({ ...c, createdAt: new Date(c.createdAt) })));
    await tx
      .insert(payments)
      .values(seed.payments.map((p) => ({ ...p, createdAt: new Date(p.createdAt) })));
    await tx.insert(stayGuests).values(
      seed.stayGuests.map((s) => ({
        ...s,
        registeredAt: s.registeredAt ? new Date(s.registeredAt) : null,
        createdAt: new Date(s.createdAt),
      })),
    );
    await tx.insert(inquiries).values(
      seed.inquiries.map(({ messages: _, ...i }) => ({
        ...i,
        receivedAt: new Date(i.receivedAt),
        lastMessageAt: new Date(i.lastMessageAt),
        archivedAt: i.archivedAt ? new Date(i.archivedAt) : null,
        trashedAt: i.trashedAt ? new Date(i.trashedAt) : null,
        processedAt: i.processedAt ? new Date(i.processedAt) : null,
      })),
    );
    await tx
      .insert(inboxMessages)
      .values(
        seed.inquiries.flatMap((i) =>
          i.messages.map((m) => ({ ...m, sentAt: new Date(m.sentAt) })),
        ),
      );
    if (seed.auditLog.length > 0) {
      await tx
        .insert(auditLog)
        .values(seed.auditLog.map((e) => ({ ...e, createdAt: new Date(e.createdAt) })));
    }
    await tx
      .insert(housekeepingTasks)
      .values(seed.housekeepingTasks.map((t) => ({ ...t, createdAt: new Date(t.createdAt) })));
    await tx.insert(hotelProfile).values({ id: 'hotel', profile: seed.hotelProfile });
    await tx.insert(pricing).values({ id: 'hotel', config: seed.pricing });
    await tx.insert(staff).values(seed.staff);
    if (seed.events.length > 0) await tx.insert(localEvents).values(seed.events);
    await tx.insert(contacts).values(seed.contacts);
    if (seed.labels.length > 0) await tx.insert(mailLabels).values(seed.labels);
    if (seed.files.length > 0) {
      await tx
        .insert(mailAttachments)
        .values(seed.files.map((f) => ({ ...f.attachment, data: f.bytes })));
    }
    if (seed.drafts.length > 0) {
      await tx
        .insert(mailDrafts)
        .values(seed.drafts.map((d) => ({ ...d, updatedAt: new Date(d.updatedAt) })));
    }
  });
}
