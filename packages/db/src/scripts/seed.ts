import { hotelToday, setHotelTimeZone } from '@orbit/domain';
import { createDb } from '../client';
import { applySeed, buildSeed, parseSeedRegion, regionSeeds } from '../seed';

// SEED_REGION=us (default) seeds the US demo lodge; cz the Czech guesthouse.
const region = parseSeedRegion(process.env.SEED_REGION);
setHotelTimeZone(process.env.HOTEL_TIMEZONE ?? regionSeeds[region].timezone);
const now = new Date();
const seed = buildSeed(hotelToday(now), now, region);
const handle = createDb(process.env.DATABASE_URL);
await applySeed(handle.db, seed);
await handle.close();
console.log(
  `Seeded ${seed.rooms.length} rooms, ${seed.guests.length} guests, ${seed.bookings.length} bookings, ` +
    `${seed.inquiries.length} inquiries for the ${seed.hotelProfile.name} (${region}, ${handle.driver}).`,
);
