import type { AgentContext } from '@orbit/shared';

/**
 * What the staff member is looking at, from the URL: an open booking inspector first, then a
 * guest profile or an inbox conversation. Null on pages about nothing in particular.
 */
export function contextFromLocation(pathname: string, search: string): AgentContext | null {
  const booking = new URLSearchParams(search).get('booking');
  if (booking) return { kind: 'booking', id: booking };
  const guest = /^\/guests\/([^/]+)$/.exec(pathname);
  if (guest) return { kind: 'guest', id: decodeURIComponent(guest[1]!) };
  const inquiry = /^\/inbox\/([^/]+)$/.exec(pathname);
  if (inquiry) return { kind: 'inquiry', id: decodeURIComponent(inquiry[1]!) };
  return null;
}
