import { DomainError, type SupplierInvoiceService } from '@orbit/domain';
import {
  MAX_ATTACHMENT_BYTES,
  paySupplierInvoiceBodySchema,
  supplierInvoiceBodySchema,
  supplierInvoiceFilterSchema,
  supplierInvoiceFromAttachmentSchema,
  supplierInvoicePatchSchema,
} from '@orbit/shared';
import { type Context, Hono } from 'hono';
import type { BillReader } from '../bills';
import { errorBody } from '../http';
import { validate } from '../validate';

export interface SupplierInvoiceRouteDeps {
  bills: SupplierInvoiceService;
  /** Null when AI is not configured. */
  reader: BillReader | null;
}

const notConfigured = errorBody('ai_not_configured', 'Reading bills needs AI to be configured.');

/** The uploaded file, or an error response when there is none or it is too large. */
async function uploaded(c: Context, field: string) {
  if (Number(c.req.header('content-length') ?? 0) > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return c.json(errorBody('too_large', 'Files can be up to 4 MB.'), 413);
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get(field);
  if (!(file instanceof File)) {
    return c.json(errorBody('invalid_input', `Send the bill as a "${field}" file.`), 400);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return c.json(errorBody('too_large', 'Files can be up to 4 MB.'), 413);
  }
  return {
    name: file.name || 'bill',
    contentType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

/**
 * Bills from suppliers: read from a file uploaded at the desk, a phone's photo (`/bill-scan/:id`,
 * where the unguessable ID is the only key and nothing read is returned) or an email's
 * attachment; checked, corrected, paid. REST callers act as `user`.
 */
export function supplierInvoiceRoutes({ bills, reader }: SupplierInvoiceRouteDeps) {
  async function readPhoneScan(c: Context, scanId: string) {
    if (!reader) return c.json(notConfigured, 503);
    const file = await uploaded(c, 'photo');
    if (file instanceof Response) return file;
    await bills.beginScan(scanId);
    try {
      const bill = await reader.read(
        file,
        { source: 'phone', inquiryId: null, senderAddress: null },
        'user',
      );
      await bills.completeScan(scanId, bill.id);
    } catch (err) {
      // A file Orbit can't use says why; anything else is logged and the phone asked to retry.
      if (!(err instanceof DomainError)) console.error('Bill scan failed', err);
      await bills.failScan(
        scanId,
        err instanceof DomainError ? err.message : 'Reading the photo failed. Try again.',
      );
    }
    return c.json(await bills.getScanForPhone(scanId));
  }

  return new Hono()
    .get('/supplier-invoices', validate('query', supplierInvoiceFilterSchema), async (c) =>
      c.json(await bills.list(c.req.valid('query'))),
    )
    .post('/supplier-invoices', validate('json', supplierInvoiceBodySchema), async (c) =>
      c.json(await bills.create(c.req.valid('json'), 'user'), 201),
    )
    .post('/supplier-invoices/upload', async (c) => {
      if (!reader) return c.json(notConfigured, 503);
      const file = await uploaded(c, 'file');
      if (file instanceof Response) return file;
      return c.json(
        await reader.read(file, { source: 'upload', inquiryId: null, senderAddress: null }, 'user'),
        201,
      );
    })
    .post(
      '/supplier-invoices/from-attachment',
      validate('json', supplierInvoiceFromAttachmentSchema),
      async (c) => {
        if (!reader) return c.json(notConfigured, 503);
        const { attachmentId, inquiryId } = c.req.valid('json');
        return c.json(await reader.readAttachment(attachmentId, inquiryId, 'user'), 201);
      },
    )
    .post('/supplier-invoices/scans', async (c) => {
      if (!reader?.photos) {
        return c.json(errorBody('ai_not_configured', 'Scanning bills needs a vision model.'), 503);
      }
      return c.json(await bills.startScan(), 201);
    })
    .get('/supplier-invoices/scans/:scanId', async (c) =>
      c.json(await bills.getScan(c.req.param('scanId'))),
    )
    .get('/supplier-invoices/:id', async (c) => c.json(await bills.get(c.req.param('id'))))
    .get('/supplier-invoices/:id/file', async (c) => {
      const { attachment, bytes } = await bills.file(c.req.param('id'));
      const name = encodeURIComponent(attachment.name);
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': attachment.contentType,
        'content-disposition': `inline; filename*=UTF-8''${name}`,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      });
    })
    .patch('/supplier-invoices/:id', validate('json', supplierInvoicePatchSchema), async (c) =>
      c.json(await bills.update(c.req.param('id'), c.req.valid('json'), 'user')),
    )
    .post('/supplier-invoices/:id/pay', validate('json', paySupplierInvoiceBodySchema), async (c) =>
      c.json(await bills.pay(c.req.param('id'), c.req.valid('json'), 'user')),
    )
    .delete('/supplier-invoices/:id', async (c) => {
      await bills.remove(c.req.param('id'), 'user');
      return c.body(null, 204);
    })
    .get('/bill-scan/:scanId', async (c) =>
      c.json(await bills.getScanForPhone(c.req.param('scanId'))),
    )
    .post('/bill-scan/:scanId/photo', (c) => readPhoneScan(c, c.req.param('scanId')));
}
