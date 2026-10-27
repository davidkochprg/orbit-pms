import { hotelToday, pricingConfig } from '@orbit/domain';
import { createDb } from '../client';
import { applySeed, buildSeed } from '../seed';

const now = new Date();
const seed = buildSeed(hotelToday(now), now, pricingConfig);
const handle = createDb(process.env.DATABASE_URL);
await applySeed(handle.db, seed);
await handle.close();
console.log(
  `Seeded ${seed.rooms.length} rooms, ${seed.guests.length} guests, ${seed.bookings.length} bookings, ` +
    `${seed.inquiries.length} inquiries (${handle.driver}).`,
);
