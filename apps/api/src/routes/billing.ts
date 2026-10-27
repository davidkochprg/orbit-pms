import type { BillingService } from '@orbit/domain';
import { newChargeBodySchema, newPaymentBodySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** A booking's bill: extras, payments and refunds. REST callers act as `user`. */
export function billingRoutes(billing: BillingService) {
  return new Hono()
    .get('/bookings/:id/folio', async (c) => c.json(await billing.getFolio(c.req.param('id'))))
    .post('/bookings/:id/charges', validate('json', newChargeBodySchema), async (c) =>
      c.json(await billing.addCharge(c.req.param('id'), c.req.valid('json'), 'user'), 201),
    )
    .delete('/bookings/:id/charges/:chargeId', async (c) =>
      c.json(await billing.removeCharge(c.req.param('id'), c.req.param('chargeId'), 'user')),
    )
    .post('/bookings/:id/payments', validate('json', newPaymentBodySchema), async (c) =>
      c.json(await billing.recordPayment(c.req.param('id'), c.req.valid('json'), 'user'), 201),
    );
}
