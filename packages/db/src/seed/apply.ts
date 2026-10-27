import type { Db } from '../client';
import {
  auditLog,
  bookings,
  guests,
  hotelProfile,
  housekeepingTasks,
  inquiries,
  pendingActions,
  rooms,
  roomTypes,
  staff,
} from '../schema';
import type { SeedData } from './build';

/** Replaces all data with the given seed, in one transaction. */
export async function applySeed(db: Db, seed: SeedData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(pendingActions);
    await tx.delete(auditLog);
    await tx.delete(housekeepingTasks);
    await tx.delete(inquiries);
    await tx.delete(bookings);
    await tx.delete(guests);
    await tx.delete(rooms);
    await tx.delete(roomTypes);
    await tx.delete(hotelProfile);
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
    await tx.insert(inquiries).values(
      seed.inquiries.map((i) => ({
        ...i,
        receivedAt: new Date(i.receivedAt),
        processedAt: i.processedAt ? new Date(i.processedAt) : null,
      })),
    );
    await tx
      .insert(housekeepingTasks)
      .values(seed.housekeepingTasks.map((t) => ({ ...t, createdAt: new Date(t.createdAt) })));
    await tx.insert(hotelProfile).values({ id: 'hotel', profile: seed.hotelProfile });
    await tx.insert(staff).values(seed.staff);
  });
}
