import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type {
  ApiError,
  GuestBook,
  Health,
  IdDocumentReading,
  IdScan,
  IdScanPhoneView,
} from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

// PGlite migrates and seeds in setup hooks; with every test file running in parallel that can
// take longer than Vitest's 10 s default.
const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, 'cz');
const repos = createRepositories(handle.db);
const usageStore = createUsageStore(handle.db);

const reading: IdDocumentReading = {
  readable: true,
  documentType: 'passport',
  fullName: 'DEMO PERSON',
  nationality: 'DE',
  dateOfBirth: '1985-03-14',
  documentNumber: 'DEMO 4711',
  address: null,
  expiresOn: '2031-01-01',
};

let next: IdDocumentReading | Error = reading;
const vision = new MockLanguageModelV4({
  doGenerate: () => {
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({
      content: [{ type: 'text', text: JSON.stringify(next) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1500, noCache: 1500, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 80, text: 80, reasoning: undefined },
      },
      warnings: [],
    });
  },
});

const app = createApp({
  repos,
  ai: {
    agent: vision,
    agentModelId: 'muse-spark-1.3',
    translate: vision,
    translateModelId: 'muse-spark-1.3',
    vision,
    visionModelId: 'muse-spark-1.3',
    transcription: null,
  },
  usage: usageStore,
  clock: () => now,
});

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(async () => {
  next = reading;
  await applySeed(handle.db, seed);
}, DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

async function call<T>(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

async function upload(path: string, file: Blob) {
  const form = new FormData();
  form.append('photo', file, 'id.jpg');
  const res = await app.request(path, { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as IdScanPhoneView & ApiError };
}

const arrival = seed.bookings.find((b) => b.checkIn === today && b.status === 'confirmed')!;

describe('ID scans', () => {
  it('reports vision support in the health check', async () => {
    expect((await call<Health>('GET', '/health')).body.ai.vision).toBe(true);
  });

  it('reads a phone photo, shows the desk the result and discards it once saved', async () => {
    const mainId = `sg_${arrival.id}`;
    const opened = await call<IdScan>('POST', `/api/bookings/${arrival.id}/scans`, {
      stayGuestId: mainId,
    });
    expect(opened.status).toBe(201);
    const scanId = opened.body.id;
    expect(scanId.length).toBeGreaterThanOrEqual(24);

    const phone = await call<IdScanPhoneView>('GET', `/api/scan/${scanId}`);
    expect(phone.body).toMatchObject({ status: 'waiting', error: null });
    expect(phone.body.firstName).toBeTruthy();

    const sent = await upload(
      `/api/scan/${scanId}/photo`,
      new Blob([jpeg()], { type: 'image/jpeg' }),
    );
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ status: 'done' });
    expect(sent.body).not.toHaveProperty('result');

    const desk = await call<IdScan>('GET', `/api/bookings/${arrival.id}/scans/${scanId}`);
    expect(desk.body.result).toMatchObject({
      name: 'Demo Person',
      nationality: 'DE',
      documentNumber: 'DEMO4711',
      warnings: [],
    });

    const { name: _name, expiresOn: _expires, warnings: _warnings, ...fields } = desk.body.result!;
    const saved = await call<GuestBook>('PATCH', `/api/bookings/${arrival.id}/guests/${mainId}`, {
      ...fields,
      address: 'Sample Street 1, DE',
      scanId,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.guests[0]).toMatchObject({ nationality: 'DE', missing: [] });
    expect((await call('GET', `/api/scan/${scanId}`)).status).toBe(404);
  });

  it('turns a failed model call into a retry on the phone', async () => {
    const { body: scan } = await call<IdScan>('POST', `/api/bookings/${arrival.id}/scans`, {});
    next = new Error('model down');
    const failed = await upload(
      `/api/scan/${scan.id}/photo`,
      new Blob([jpeg()], { type: 'image/jpeg' }),
    );
    expect(failed.body).toMatchObject({
      status: 'failed',
      error: 'Reading the photo failed. Try again.',
    });
    next = reading;
    const retried = await upload(
      `/api/scan/${scan.id}/photo`,
      new Blob([jpeg()], { type: 'image/jpeg' }),
    );
    expect(retried.body.status).toBe('done');
  });

  it('rejects files that are not images, unknown links and another booking', async () => {
    const { body: scan } = await call<IdScan>('POST', `/api/bookings/${arrival.id}/scans`, {});
    const text = await upload(
      `/api/scan/${scan.id}/photo`,
      new Blob(['hello'], { type: 'image/jpeg' }),
    );
    expect(text.status).toBe(400);
    expect((await call('GET', '/api/scan/nope')).status).toBe(404);
    const other = seed.bookings.find((b) => b.id !== arrival.id)!;
    expect((await call('GET', `/api/bookings/${other.id}/scans/${scan.id}`)).status).toBe(404);
  });
});
