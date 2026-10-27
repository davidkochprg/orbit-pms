import type { Repositories } from '@orbit/domain';
import type { Health } from '@orbit/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { errorBody, handleError } from './http';
import { bookingRoutes } from './routes/bookings';
import { guestRoutes } from './routes/guests';
import { roomRoutes } from './routes/rooms';

export interface AppDeps {
  repos: Repositories;
  aiConfigured: boolean;
  log?: boolean;
}

export function createApp({ repos, aiConfigured, log = false }: AppDeps) {
  const app = new Hono();
  if (log) app.use(logger());

  app.get('/health', (c) => c.json<Health>({ status: 'ok', ai: { configured: aiConfigured } }));
  app.route('/api', roomRoutes(repos));
  app.route('/api', bookingRoutes(repos));
  app.route('/api', guestRoutes(repos));

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));
  app.onError(handleError);
  return app;
}
