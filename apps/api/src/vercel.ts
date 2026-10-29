import { getRequestListener } from '@hono/node-server';
import { createServer } from './server';

/**
 * The Vercel Function entry. Built into one file by `scripts/build-vercel.ts`; one instance serves
 * many requests, so the database pool and the demo limits live as long as the instance.
 */
const { app } = createServer(process.env);

export default getRequestListener(app.fetch);
