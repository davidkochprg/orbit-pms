import type { IdScanReader } from '@orbit/ai';
import type { IdScanService } from '@orbit/domain';
import { newIdScanBodySchema } from '@orbit/shared';
import { type Context, Hono } from 'hono';
import type { AiGate } from '../ai-gate';
import { errorBody } from '../http';
import { validate } from '../validate';

/** Phones send a downscaled JPEG of a few hundred KB; this leaves room for a full-size photo. */
export const MAX_ID_PHOTO_BYTES = 8 * 1024 * 1024;

const imageTypes: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) =>
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP',
};

export interface IdScanRouteDeps {
  scans: IdScanService;
  /** Null when no vision model is configured. */
  read: IdScanReader | null;
  gate: AiGate;
}

const notConfigured = errorBody('ai_not_configured', 'ID scanning needs a vision model.');

/**
 * ID scans. The desk opens a scan and polls it under the booking; the phone uses `/scan/:id`,
 * where the unguessable ID is the only key and nothing from the document is returned. The photo
 * is read in memory and never stored.
 */
export function idScanRoutes({ scans, read, gate }: IdScanRouteDeps) {
  async function readPhoto(c: Context, scanId: string) {
    if (!read) return c.json(notConfigured, 503);
    if (Number(c.req.header('content-length') ?? 0) > MAX_ID_PHOTO_BYTES) {
      return c.json(errorBody('too_large', 'The photo is too large.'), 413);
    }
    const form = await c.req.formData().catch(() => null);
    const photo = form?.get('photo');
    if (!(photo instanceof File)) {
      return c.json(errorBody('invalid_input', 'Send the photo as a "photo" file.'), 400);
    }
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const mediaType = photo.type;
    if (bytes.length > MAX_ID_PHOTO_BYTES) {
      return c.json(errorBody('too_large', 'The photo is too large.'), 413);
    }
    if (!imageTypes[mediaType]?.(bytes)) {
      return c.json(errorBody('invalid_input', 'The photo must be a JPEG, PNG or WebP.'), 400);
    }
    const blocked = await gate(c.req.header('x-forwarded-for'));
    if (blocked) return c.json(errorBody('demo_limit', blocked), 429);
    await scans.beginReading(scanId);
    try {
      await scans.complete(scanId, await read({ bytes, mediaType }));
    } catch (err) {
      console.error('ID scan failed', err);
      await scans.fail(scanId, 'Reading the photo failed. Try again.');
    }
    return c.json(await scans.getForPhone(scanId));
  }

  return new Hono()
    .post('/bookings/:id/scans', validate('json', newIdScanBodySchema), async (c) => {
      if (!read) return c.json(notConfigured, 503);
      const { stayGuestId } = c.req.valid('json');
      return c.json(await scans.start(c.req.param('id'), stayGuestId), 201);
    })
    .get('/bookings/:id/scans/:scanId', async (c) =>
      c.json(await scans.getForDesk(c.req.param('id'), c.req.param('scanId'))),
    )
    .post('/bookings/:id/scans/:scanId/photo', async (c) => {
      // Uploaded at the desk instead of from a phone: same reading, checked against the booking.
      const scanId = c.req.param('scanId');
      await scans.getForDesk(c.req.param('id'), scanId);
      return readPhoto(c, scanId);
    })
    .get('/scan/:scanId', async (c) => c.json(await scans.getForPhone(c.req.param('scanId'))))
    .post('/scan/:scanId/photo', (c) => readPhoto(c, c.req.param('scanId')));
}
