import type { AccessStatus, ApiError } from '@orbit/shared';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, createDemoAccess } from './access';

function appWith(code: string | undefined, clock?: () => Date) {
  const access = createDemoAccess({ code, clock });
  const app = new Hono();
  app.use('/api/*', access.guard);
  app.route('/api', access.routes);
  app.get('/api/rooms', (c) => c.json([]));
  app.get('/api/scan/:id', (c) => c.json({ id: c.req.param('id') }));
  app.post('/api/scan/:id/photo', (c) => c.json({ ok: true }));
  return app;
}

const enter = (app: Hono, code: string, ip = '203.0.113.7') =>
  app.request('/api/access', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ code }),
  });

function cookieFrom(res: Response) {
  const match = /orbit_access=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  return match ? `${ACCESS_COOKIE}=${match[1]}` : '';
}

describe('demo access', () => {
  it('leaves everything open without a code', async () => {
    const app = appWith(undefined);
    expect((await app.request('/api/rooms')).status).toBe(200);
    const status = (await (await app.request('/api/access')).json()) as AccessStatus;
    expect(status).toEqual({ required: false, granted: true });
  });

  it('blocks the API until the right code is entered', async () => {
    const app = appWith('quiet-harbor-lantern');
    const blocked = await app.request('/api/rooms');
    expect(blocked.status).toBe(401);
    expect(((await blocked.json()) as ApiError).error.code).toBe('access_required');
    expect(await (await app.request('/api/access')).json()).toEqual({
      required: true,
      granted: false,
    });

    const res = await enter(app, 'quiet-harbor-lantern');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const cookie = cookieFrom(res);
    expect((await app.request('/api/rooms', { headers: { cookie } })).status).toBe(200);
    expect(await (await app.request('/api/access', { headers: { cookie } })).json()).toEqual({
      required: true,
      granted: true,
    });
  });

  it('marks the cookie secure behind https', async () => {
    const app = appWith('quiet-harbor-lantern');
    const res = await app.request('/api/access', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ code: 'quiet-harbor-lantern' }),
    });
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });

  it('rejects a wrong code and a forged cookie', async () => {
    const app = appWith('quiet-harbor-lantern');
    const res = await enter(app, 'quiet-harbor');
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiError).error.code).toBe('invalid_code');
    expect(res.headers.get('set-cookie')).toBeNull();
    const forged = { cookie: `${ACCESS_COOKIE}=quiet-harbor-lantern` };
    expect((await app.request('/api/rooms', { headers: forged })).status).toBe(401);
  });

  it('signs browsers out when the code changes', async () => {
    const cookie = cookieFrom(await enter(appWith('quiet-harbor-lantern'), 'quiet-harbor-lantern'));
    expect((await appWith('new-code').request('/api/rooms', { headers: { cookie } })).status).toBe(
      401,
    );
  });

  it('keeps the phone scan page open, since its ID is the key', async () => {
    const app = appWith('quiet-harbor-lantern');
    expect((await app.request('/api/scan/abc')).status).toBe(200);
    expect((await app.request('/api/scan/abc/photo', { method: 'POST' })).status).toBe(200);
    expect((await app.request('/api/scan/abc/other')).status).toBe(401);
  });

  it('locks out an address after too many wrong codes, for a while', async () => {
    let now = new Date('2026-10-29T12:00:00Z');
    const app = appWith('quiet-harbor-lantern', () => now);
    for (let i = 0; i < 10; i++) expect((await enter(app, 'wrong')).status).toBe(401);
    expect((await enter(app, 'quiet-harbor-lantern')).status).toBe(429);
    expect((await enter(app, 'quiet-harbor-lantern', '198.51.100.2')).status).toBe(200);
    now = new Date('2026-10-29T12:16:00Z');
    expect((await enter(app, 'quiet-harbor-lantern')).status).toBe(200);
  });
});
