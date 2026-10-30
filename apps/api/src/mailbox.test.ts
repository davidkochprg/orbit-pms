import { applySeed, buildSeed, createDb, createRepositories, createUsageStore } from '@orbit/db';
import type { ApiError, Attachment, Inquiry, MailDraft, MailLabel } from '@orbit/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';

const DB_SETUP_TIMEOUT = 60_000;
const now = new Date('2026-10-27T08:00:00Z');
const handle = createDb('memory://');
const seed = buildSeed('2026-10-27', now, 'us');
const repos = createRepositories(handle.db);
const app = createApp({ repos, ai: null, usage: createUsageStore(handle.db), clock: () => now });

async function call<T>(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-staff-id': 'stf_jordan' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function upload(name: string, type: string, bytes: Uint8Array<ArrayBuffer>) {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type }));
  const res = await app.request('/api/inbox/attachments', { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as Attachment & ApiError };
}

beforeAll(() => handle.migrate(), DB_SETUP_TIMEOUT);
beforeEach(() => applySeed(handle.db, seed), DB_SETUP_TIMEOUT);
afterAll(() => handle.close());

describe('mailbox', () => {
  it('lists the seeded labels and drafts, and adds, renames and deletes a label', async () => {
    expect((await call<MailLabel[]>('GET', '/api/inbox/labels')).body).toHaveLength(3);
    expect((await call<MailDraft[]>('GET', '/api/inbox/drafts')).body.length).toBeGreaterThan(0);
    const vip = await call<MailLabel>('POST', '/api/inbox/labels', { name: 'VIP' });
    expect(vip).toMatchObject({ status: 201, body: { name: 'VIP', color: 'gray' } });
    expect((await call('POST', '/api/inbox/labels', { name: 'vip' })).status).toBe(409);
    await call('PUT', `/api/inbox/labels/${vip.body.id}`, { name: 'VIPs', color: 'violet' });
    expect((await call('DELETE', `/api/inbox/labels/${vip.body.id}`)).status).toBe(204);
  });

  it('uploads a file, keeps it on a draft and sends it with copies', async () => {
    const file = await upload('menu.pdf', 'application/pdf', new Uint8Array([37, 80, 68, 70]));
    expect(file).toMatchObject({ status: 201, body: { name: 'menu.pdf', size: 4 } });
    const draft = await call<MailDraft>('PUT', '/api/inbox/drafts/drf_test_01', {
      to: [{ name: 'Guest', address: 'guest@example.com' }],
      subject: 'Our menu',
      body: 'Attached',
      attachmentIds: [file.body.id],
    });
    expect(draft.body.attachments).toEqual([file.body]);
    const sent = await call<Inquiry>('POST', '/api/inbox/compose', {
      to: draft.body.to,
      cc: [{ name: null, address: 'chef@example.com' }],
      subject: 'Our menu',
      body: 'Attached',
      attachmentIds: [file.body.id],
      draftId: draft.body.id,
    });
    expect(sent.status).toBe(201);
    expect(sent.body.messages[0]).toMatchObject({
      author: 'Jordan Lee',
      cc: [{ address: 'chef@example.com' }],
      attachments: [file.body],
    });
    const drafts = await call<MailDraft[]>('GET', '/api/inbox/drafts');
    expect(drafts.body.some((d) => d.id === draft.body.id)).toBe(false);
  });

  it('serves a PDF in place and anything else as a download', async () => {
    const pdf = await app.request('/api/inbox/attachments/att_seed_order');
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-disposition')).toMatch(/^inline/);
    const csv = await app.request('/api/inbox/attachments/att_seed_guests');
    expect(csv.headers.get('content-type')).toBe('application/octet-stream');
    expect(csv.headers.get('content-disposition')).toMatch(
      /^attachment; filename\*=UTF-8''Wedding/,
    );
    expect(await csv.text()).toContain('Riley Example');
    expect((await app.request('/api/inbox/attachments/att_x')).status).toBe(404);
  });

  it('refuses an upload that is not a file', async () => {
    const res = await app.request('/api/inbox/attachments', {
      method: 'POST',
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });

  it('stars, labels, trashes and deletes a conversation for good', async () => {
    const id = 'inq_seed_wedding';
    expect(
      (await call<Inquiry>('POST', `/api/inbox/${id}/star`, { starred: false })).body,
    ).toMatchObject({ starred: false });
    expect(
      (await call<Inquiry>('POST', `/api/inbox/${id}/labels`, { labelIds: ['lbl_suppliers'] })).body
        .labelIds,
    ).toEqual(['lbl_suppliers']);
    expect((await call('DELETE', `/api/inbox/${id}`)).status).toBe(409);
    await call('POST', `/api/inbox/${id}/trash`, { trashed: true });
    expect((await call('DELETE', `/api/inbox/${id}`)).status).toBe(204);
    expect((await call('GET', `/api/inbox/${id}`)).status).toBe(404);
  });

  it('changes many conversations at once', async () => {
    const res = await call<Inquiry[]>('POST', '/api/inbox/bulk', {
      ids: ['inq_01', 'inq_02'],
      action: 'label',
      labelId: 'lbl_follow_up',
    });
    expect(res.body.map((m) => m.labelIds)).toEqual([['lbl_follow_up'], ['lbl_follow_up']]);
    const bad = await call<ApiError>('POST', '/api/inbox/bulk', {
      ids: ['inq_01'],
      action: 'label',
    });
    expect(bad.status).toBe(400);
  });

  it('copies a reply to more people by email', async () => {
    const res = await call<Inquiry>('POST', '/api/inbox/inq_seed_wedding/send', {
      body: 'Yes, the sauna is yours on Saturday.',
      cc: [{ name: 'Riley Example', address: 'riley@example.com' }],
      draftId: 'drf_seed_wedding',
    });
    expect(res.body.messages.at(-1)?.cc).toEqual([
      { name: 'Riley Example', address: 'riley@example.com' },
    ]);
    const drafts = await call<MailDraft[]>('GET', '/api/inbox/drafts');
    expect(drafts.body.some((d) => d.id === 'drf_seed_wedding')).toBe(false);
  });
});
