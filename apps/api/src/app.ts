import { createHotelService, pricingConfig, type Repositories } from '@orbit/domain';
import type { Health } from '@orbit/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { errorBody, handleError } from './http';
import { bookingRoutes } from './routes/bookings';
import { guestRoutes } from './routes/guests';
import { overviewRoutes } from './routes/overview';
import { roomRoutes } from './routes/rooms';

export interface AppDeps {
  repos: Repositories;
  aiConfigured: boolean;
  clock?: () => Date;
  log?: boolean;
}

export function createApp({ repos, aiConfigured, clock = () => new Date(), log = false }: AppDeps) {
  const service = createHotelService({ repos, pricing: pricingConfig, clock });
  const app = new Hono();
  if (log) app.use(logger());

  app.get('/health', (c) => c.json<Health>({ status: 'ok', ai: { configured: aiConfigured } }));
  app.route('/api', roomRoutes(repos));
  app.route('/api', bookingRoutes(repos, service));
  app.route('/api', guestRoutes(repos));
  app.route('/api', overviewRoutes(repos, service));

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));
  app.onError(handleError);
  return app;
}
