import { createDb } from '../client';

const handle = createDb(process.env.DATABASE_URL);
await handle.migrate();
await handle.close();
console.log(`Migrations applied (${handle.driver}).`);
