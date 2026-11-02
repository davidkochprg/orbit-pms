import type { AgentContext } from '@orbit/shared';

/**
 * What the staff member is looking at, from the URL: an open booking inspector first, then a
 * guest profile, an inbox conversation, an open repair, contact or Knowledge note. Null on pages
 * about nothing in particular; pages showing dates say so themselves (`usePageAgentContext`).
 */
export function contextFromLocation(pathname: string, search: string): AgentContext | null {
  const params = new URLSearchParams(search);
  const booking = params.get('booking');
  if (booking) return { kind: 'booking', id: booking };
  const guest = /^\/guests\/([^/]+)$/.exec(pathname);
  if (guest) return { kind: 'guest', id: decodeURIComponent(guest[1]!) };
  const inquiry = /^\/inbox\/([^/]+)$/.exec(pathname);
  if (inquiry && inquiry[1] !== 'new')
    return { kind: 'inquiry', id: decodeURIComponent(inquiry[1]!) };
  const repair = pathname === '/housekeeping' && params.get('repair');
  if (repair) return { kind: 'repair', id: repair };
  const contact = pathname === '/contacts' && params.get('contact');
  if (contact) return { kind: 'contact', id: contact };
  const bill = pathname === '/invoices' && params.get('bill');
  if (bill) return { kind: 'bill', id: bill };
  const note = pathname === '/knowledge' && params.get('note');
  if (note) return { kind: 'note', id: note };
  return null;
}

/** The nights from `from` to `to`, both included, as a context ID. */
export function rangeId(from: string, to: string): string {
  return `${from}..${to}`;
}

/** The two dates of a range context ID, or null for another kind of ID. */
export function parseRangeId(id: string): { from: string; to: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(id);
  return match ? { from: match[1]!, to: match[2]! } : null;
}
