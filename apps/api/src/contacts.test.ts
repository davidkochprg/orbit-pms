import {
  applySeed,
  buildSeed,
  createDb,
  createRepositories,
  createUsageStore,
  schema,
} from '@orbit/db';
import type {
  ApiError,
  Contact,
  HousekeepingTask,
  KnockOn,
  Repair,
  WorkOrder,
} from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

const DB_SETUP_TIMEOUT = 60_000;

const today = '2026-10-27';
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed(today, now, 'us');
const repos = createRepositories(handle.db);
const usageStore = createUsageStore(handle.db);

/** Sorts every repair under "building" and drafts every email the same way. */
const prompts: string[] = [];
const model = new MockLanguageModelV4({
  doGenerate: ({ prompt }) => {
    const text = JSON.stringify(prompt);
    prompts.push(text);
    return Promise.resolve({
      content: [
        {
          type: 'text',
          text: text.includes('repair notes by who fixes them')
            ? JSON.stringify({ trade: 'building' })
            : 'Subject: Tap in room 203\n\nHi Sam,\nCould you come and look at it?\nJordan',
        },
      ],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 200, noCache: 200, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 30, text: 30, reasoning: undefined },
      },
      warnings: [],
    });
  },
});

function appWith({ ai = true } = {}) {
  return createApp({
    repos,
    ai: ai
      ? {
          agent: model,
          agentModelId: 'muse-spark-1.3',
          translate: model,
          translateModelId: 'muse-spark-1.3',
          draft: model,
          draftModelId: 'muse-spark-1.3',
          vision: null,
          visionModelId: null,
          transcription: null,
        }
      : null,
    usage: usageStore,
    clock: () => now,
  });
}

async function call<T>(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-staff-id': 'stf_jordan' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

/** The seed's dripping tap in 203, which nobody has been asked to fix. */
const tapTask = () => seed.housekeepingTasks.find((t) => t.roomId === 'rm_203' && t.trade)!;

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(async () => {
  prompts.length = 0;
  await applySeed(handle.db, seed);
  await handle.db.delete(schema.aiUsage);
}, DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

describe('contacts', () => {
  it('lists, adds, edits and deletes contacts', async () => {
    const app = appWith({ ai: false });
    const listed = await call<Contact[]>(app, 'GET', '/api/contacts');
    expect(listed.body.map((c) => c.name)).toContain('Ridgeline Plumbing');

    const body = {
      name: 'Example Glass',
      person: '',
      trades: ['building'],
      phone: '555 0100',
      email: '',
      language: 'en',
      notes: null,
    };
    const created = await call<Contact>(app, 'POST', '/api/contacts', body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Example Glass', person: null, email: null });

    const bad = await call<ApiError>(app, 'POST', '/api/contacts', { ...body, trades: [] });
    expect(bad.status).toBe(400);

    const edited = await call<Contact>(app, 'PUT', `/api/contacts/${created.body.id}`, {
      ...body,
      email: 'glass@example.com',
    });
    expect(edited.body.email).toBe('glass@example.com');

    expect((await call(app, 'DELETE', `/api/contacts/${created.body.id}`)).status).toBe(204);
    expect((await call(app, 'DELETE', `/api/contacts/${created.body.id}`)).status).toBe(404);
  });
});

describe('repairs', () => {
  it('suggests the plumber for the seeded tap, until someone is asked', async () => {
    const app = appWith({ ai: false });
    const cards = await call<KnockOn[]>(app, 'GET', '/api/knock-ons');
    expect(cards.body).toContainEqual(
      expect.objectContaining({
        kind: 'repair',
        taskId: tapTask().id,
        roomName: '203',
      }),
    );

    expect(cards.body.find((k) => k.kind === 'repair')).toMatchObject({
      contact: { id: 'ct_plumbing' },
    });
    const repair = await call<Repair>(app, 'GET', `/api/housekeeping/tasks/${tapTask().id}/repair`);
    expect(repair.body.contacts.map((c) => c.id)).toEqual(['ct_plumbing']);
    expect(repair.body.contact).toBeNull();

    const asked = await call<HousekeepingTask>(
      app,
      'POST',
      `/api/housekeeping/tasks/${tapTask().id}/contact`,
      { contactId: 'ct_plumbing' },
    );
    expect(asked.body).toMatchObject({ contactId: 'ct_plumbing', status: 'in_progress' });
    const after = await call<KnockOn[]>(app, 'GET', '/api/knock-ons');
    expect(after.body.filter((k) => k.kind === 'repair')).toEqual([]);
  });

  it('drafts the email to a contractor, signed by the staff member', async () => {
    const app = appWith();
    const draft = await call<WorkOrder>(
      app,
      'POST',
      `/api/housekeeping/tasks/${tapTask().id}/work-order`,
      { contactId: 'ct_plumbing' },
    );
    expect(draft.body).toEqual({
      to: 'dispatch@ridgeline-plumbing.example',
      subject: 'Tap in room 203',
      body: 'Hi Sam,\nCould you come and look at it?\nJordan',
    });
    expect(prompts[0]).toContain('Room: 203');
    expect(prompts[0]).toContain('Sign as: Jordan');
  });

  it('needs AI for a drafted email', async () => {
    const res = await call<ApiError>(
      appWith({ ai: false }),
      'POST',
      `/api/housekeeping/tasks/${tapTask().id}/work-order`,
      { contactId: 'ct_plumbing' },
    );
    expect(res.status).toBe(503);
  });

  it('works out who fixes a repair added by hand, unless it is given', async () => {
    const app = appWith();
    const guessed = await call<HousekeepingTask>(app, 'POST', '/api/housekeeping/tasks', {
      roomId: 'rm_101',
      type: 'maintenance',
      notes: 'Wardrobe door came off',
    });
    expect(guessed.body.trade).toBe('building');
    const given = await call<HousekeepingTask>(app, 'POST', '/api/housekeeping/tasks', {
      roomId: 'rm_101',
      type: 'maintenance',
      notes: 'Lamp broken',
      trade: 'electrical',
    });
    expect(given.body.trade).toBe('electrical');
    const cleaning = await call<HousekeepingTask>(app, 'POST', '/api/housekeeping/tasks', {
      roomId: 'rm_101',
      type: 'turnover',
      notes: null,
    });
    expect(cleaning.body.trade).toBeNull();
    // One call: the repair whose trade wasn't given.
    expect(prompts).toHaveLength(1);
  });
});
