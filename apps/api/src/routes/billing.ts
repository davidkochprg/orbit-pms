import type { BillingService } from '@orbit/domain';
import { chargePatchSchema, newChargeBodySchema, newPaymentBodySchema } from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

/** A booking's bill: extras (added, edited, removed), payments and refunds. REST callers act as `user`. */
export function billingRoutes(billing: BillingService) {
  return new Hono()
    .get('/bookings/:id/folio', async (c) => c.json(await billing.getFolio(c.req.param('id'))))
    .post('/bookings/:id/charges', validate('json', newChargeBodySchema), async (c) =>
      c.json(await billing.addCharge(c.req.param('id'), c.req.valid('json'), 'user'), 201),
    )
    .patch('/bookings/:id/charges/:chargeId', validate('json', chargePatchSchema), async (c) =>
      c.json(
        await billing.updateCharge(
          c.req.param('id'),
          c.req.param('chargeId'),
          c.req.valid('json'),
          'user',
        ),
      ),
    )
    .delete('/bookings/:id/charges/:chargeId', async (c) =>
      c.json(await billing.removeCharge(c.req.param('id'), c.req.param('chargeId'), 'user')),
    )
    .post('/bookings/:id/payments', validate('json', newPaymentBodySchema), async (c) =>
      c.json(await billing.recordPayment(c.req.param('id'), c.req.valid('json'), 'user'), 201),
    );
}
