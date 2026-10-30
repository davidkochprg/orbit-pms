import { type Contact, tradeLabels } from '@orbit/shared';

/** Whether a contact matches a filter by its name, who to ask for, or what it does. */
export function contactMatches(contact: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [contact.name, contact.person ?? '', ...contact.trades.map((t) => tradeLabels[t])].some(
    (text) => text.toLowerCase().includes(q),
  );
}
