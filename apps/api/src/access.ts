import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { type AccessStatus, accessBodySchema } from '@orbit/shared';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { errorBody } from './http';
import { validate } from './validate';

export const ACCESS_COOKIE = 'orbit_access';
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/** Paths that stay open: the code check itself, and the phone scan page, keyed by its scan ID. */
const openPaths = [/^\/api\/access$/, /^\/api\/scan\/[^/]+(\/photo)?$/];

function sameSecret(a: string, b: string) {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

function isHttps(c: Context) {
  return c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https:');
}

/**
 * Keeps a public deployment private until the demo opens: with an access code set, every API call
 * needs a cookie that only the code can produce. Without a code, everything stays open.
 * The cookie is an HMAC keyed by the code, so changing the code signs every browser out.
 */
export function createDemoAccess({
  code,
  clock = () => new Date(),
}: {
  code: string | undefined;
  clock?: () => Date;
}) {
  const token = code && createHmac('sha256', code).update('orbit-demo-access').digest('base64url');
  const failures = new Map<string, number[]>();

  const granted = (c: Context) => {
    if (!token) return true;
    const cookie = getCookie(c, ACCESS_COOKIE);
    return cookie !== undefined && sameSecret(cookie, token);
  };

  const status = (c: Context): AccessStatus => ({ required: !!token, granted: granted(c) });

  const guard: MiddlewareHandler = async (c, next) => {
    if (granted(c) || openPaths.some((p) => p.test(c.req.path))) return next();
    return c.json(errorBody('access_required', 'Enter the demo access code.'), 401);
  };

  const routes = new Hono()
    .get('/access', (c) => c.json(status(c)))
    .post('/access', validate('json', accessBodySchema), (c) => {
      if (!code || !token) return c.json(status(c));
      const ip = clientIp(c);
      const cutoff = clock().getTime() - ATTEMPT_WINDOW_MS;
      const recent = (failures.get(ip) ?? []).filter((t) => t > cutoff);
      if (recent.length >= MAX_FAILED_ATTEMPTS) {
        return c.json(errorBody('rate_limit', 'Too many wrong codes. Try again later.'), 429);
      }
      if (!sameSecret(c.req.valid('json').code, code)) {
        failures.set(ip, [...recent, clock().getTime()]);
        return c.json(errorBody('invalid_code', 'That access code is not right.'), 401);
      }
      failures.delete(ip);
      setCookie(c, ACCESS_COOKIE, token, {
        httpOnly: true,
        secure: isHttps(c),
        sameSite: 'Lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });
      return c.json<AccessStatus>({ required: true, granted: true });
    });

  return { guard, routes };
}
