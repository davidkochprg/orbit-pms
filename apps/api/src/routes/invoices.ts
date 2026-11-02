import type { InvoiceService } from '@orbit/domain';
import {
  emailInvoiceBodySchema,
  invoiceFilterSchema,
  issueInvoiceBodySchema,
  STAFF_HEADER,
  type StaffMember,
  voidInvoiceBodySchema,
} from '@orbit/shared';
import { Hono } from 'hono';
import { validate } from '../validate';

export interface InvoiceRouteDeps {
  invoices: InvoiceService;
  identify: (id: string | undefined) => Promise<StaffMember | null>;
}

/**
 * Invoices and receipts for bookings' bills: issued, listed, voided (optionally reissued), as a
 * PDF, and emailed with the PDF attached. The staff member signed in is named as the issuer.
 */
export function invoiceRoutes({ invoices, identify }: InvoiceRouteDeps) {
  const staffName = async (header: string | undefined) => (await identify(header))?.name ?? null;
  return new Hono()
    .get('/invoices', validate('query', invoiceFilterSchema), async (c) =>
      c.json(await invoices.list(c.req.valid('query'))),
    )
    .get('/invoices/:id', async (c) => c.json(await invoices.get(c.req.param('id'))))
    .get('/invoices/:id/pdf', async (c) => {
      const { invoice, bytes } = await invoices.pdf(c.req.param('id'));
      const name = encodeURIComponent(`${invoice.number}.pdf`);
      const inline = c.req.query('download') === undefined;
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': 'application/pdf',
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
        'x-content-type-options': 'nosniff',
      });
    })
    .post('/bookings/:id/invoices', validate('json', issueInvoiceBodySchema), async (c) =>
      c.json(
        await invoices.issue(
          c.req.param('id'),
          c.req.valid('json'),
          'user',
          await staffName(c.req.header(STAFF_HEADER)),
        ),
        201,
      ),
    )
    .post('/invoices/:id/void', validate('json', voidInvoiceBodySchema), async (c) =>
      c.json(
        await invoices.void(
          c.req.param('id'),
          c.req.valid('json'),
          'user',
          await staffName(c.req.header(STAFF_HEADER)),
        ),
      ),
    )
    .post('/invoices/:id/email', validate('json', emailInvoiceBodySchema), async (c) =>
      c.json(
        await invoices.email(
          c.req.param('id'),
          c.req.valid('json'),
          await staffName(c.req.header(STAFF_HEADER)),
          'user',
        ),
        201,
      ),
    );
}
