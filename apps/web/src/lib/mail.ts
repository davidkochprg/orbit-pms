import type { Contact, Guest, Inquiry, Recipient } from '@orbit/shared';
import { formatDateTime } from '@/lib/format';
import { senderLabel } from '@/lib/inbox';

const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** "Riley Example <riley@example.com>" or the address alone. */
export function formatRecipient({ name, address }: Recipient): string {
  return name ? `${name} <${address}>` : address;
}

/** How a recipient is shown in a line: their name, or the address. */
export function recipientLabel({ name, address }: Recipient): string {
  return name ?? address;
}

/**
 * Addresses as typed or pasted: separated by commas, semicolons or new lines, each either an
 * address or "Name <address>". Whatever isn't an address comes back in `invalid`.
 */
export function parseRecipients(text: string): { recipients: Recipient[]; invalid: string[] } {
  const recipients: Recipient[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const raw = part.trim();
    if (!raw) continue;
    const named = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(raw);
    const address = (named ? named[2]! : raw).trim();
    if (!ADDRESS.test(address)) {
      invalid.push(raw);
      continue;
    }
    recipients.push({ name: named?.[1]?.trim() || null, address });
  }
  return { recipients, invalid };
}

/** Recipients without repeats of an address, keeping the first. */
export function uniqueRecipients(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const key = r.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface AddressEntry extends Recipient {
  /** Where the address is known from. */
  kind: 'guest' | 'contact' | 'mail';
}

/** Everyone staff may write to: guests, contacts and people in the mailbox, one entry each. */
export function addressBook(
  guests: Pick<Guest, 'name' | 'email'>[],
  contacts: Pick<Contact, 'name' | 'person' | 'email'>[],
  inquiries: Inquiry[],
): AddressEntry[] {
  const entries: AddressEntry[] = [
    ...contacts.flatMap((c) =>
      c.email
        ? [
            {
              name: c.person ? `${c.person} (${c.name})` : c.name,
              address: c.email,
              kind: 'contact' as const,
            },
          ]
        : [],
    ),
    ...guests.flatMap((g) =>
      g.email ? [{ name: g.name, address: g.email, kind: 'guest' as const }] : [],
    ),
    ...inquiries.flatMap((m) => [
      ...(m.senderAddress
        ? [{ name: m.senderName, address: m.senderAddress, kind: 'mail' as const }]
        : []),
      ...m.messages.flatMap((x) =>
        [...x.to, ...x.cc].map((r) => ({ ...r, kind: 'mail' as const })),
      ),
    ]),
  ];
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Up to `limit` entries matching what is typed, names and addresses starting with it first. */
export function suggestAddresses(
  book: AddressEntry[],
  query: string,
  exclude: Recipient[],
  limit = 6,
): AddressEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const taken = new Set(exclude.map((r) => r.address.toLowerCase()));
  const rank = (e: AddressEntry) => {
    const name = e.name?.toLowerCase() ?? '';
    const address = e.address.toLowerCase();
    if (name.startsWith(q) || address.startsWith(q)) return 0;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    return name.includes(q) || address.includes(q) ? 2 : 3;
  };
  return book
    .filter((e) => !taken.has(e.address.toLowerCase()) && rank(e) < 3)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

/**
 * Who else a "reply all" goes to: everyone on the guest's latest message besides the guest,
 * and the people the hotel wrote to last, without the hotel's own address.
 */
export function replyAllCc(m: Inquiry, hotelAddress: string | null): Recipient[] {
  const lastIn = m.messages.findLast((x) => x.direction === 'in');
  const lastOut = m.messages.findLast((x) => x.direction === 'out');
  const skip = new Set(
    [m.senderAddress, hotelAddress].filter((a): a is string => !!a).map((a) => a.toLowerCase()),
  );
  return uniqueRecipients([
    ...(lastIn?.to ?? []),
    ...(lastIn?.cc ?? []),
    ...(lastOut?.to ?? []),
    ...(lastOut?.cc ?? []),
  ]).filter((r) => !skip.has(r.address.toLowerCase()));
}

/** Whether a conversation has anyone to reply all to. */
export function canReplyAll(m: Inquiry, hotelAddress: string | null): boolean {
  return m.channel === 'email' && replyAllCc(m, hotelAddress).length > 0;
}

export function forwardSubject(subject: string | null): string {
  const s = subject?.trim() || '(no subject)';
  return /^fwd?:/i.test(s) ? s : `Fwd: ${s}`;
}

/** The whole conversation as a forward quotes it, oldest message first. */
export function forwardBody(m: Inquiry, hotelName: string): string {
  const quoted = m.messages.map((x) => {
    const from =
      x.direction === 'in'
        ? m.senderAddress
          ? formatRecipient({ name: m.senderName, address: m.senderAddress })
          : senderLabel(m)
        : `${x.author ? `${x.author}, ` : ''}${hotelName}`;
    const to = x.to.length > 0 ? `\nTo: ${x.to.map(formatRecipient).join(', ')}` : '';
    const cc = x.cc.length > 0 ? `\nCc: ${x.cc.map(formatRecipient).join(', ')}` : '';
    return `From: ${from}\nDate: ${formatDateTime(x.sentAt)}${to}${cc}\n\n${x.body}`;
  });
  return `\n\n---------- Forwarded conversation ----------\nSubject: ${m.subject ?? '(no subject)'}\n\n${quoted.join('\n\n')}`;
}

/** Every file in a conversation, once each, for a forward to carry. */
export function conversationFiles(m: Inquiry) {
  const files = m.messages.flatMap((x) => x.attachments);
  return files.filter((f, i) => files.findIndex((o) => o.id === f.id) === i);
}

/** "312 KB", "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A new draft's ID, made here so it can be saved as staff type without waiting for one.
 * `getRandomValues` works on plain-HTTP addresses too, unlike `randomUUID`, e.g. when the app
 * is opened from another device on the local network.
 */
export function newDraftId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `drf_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Where a file opens: in the browser when it can show it, else as a download. */
export function attachmentHref(id: string): string {
  return `/api/inbox/attachments/${encodeURIComponent(id)}`;
}

/** Asks the open conversation to start a reply (`detail`: "reply" or "replyAll"), from a key. */
export const REPLY_EVENT = 'orbit:reply';

/** The list's own query, without the composer's. */
export function stripCompose(search: string): string {
  const p = new URLSearchParams(search);
  p.delete('draft');
  p.delete('forward');
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Where a forward of a conversation is written, keeping the list's folder. */
export function forwardLink(id: string, search: string): string {
  const p = new URLSearchParams(stripCompose(search));
  p.set('forward', id);
  return `/inbox/new?${p.toString()}`;
}
