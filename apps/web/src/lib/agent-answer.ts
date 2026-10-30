import type { BookingStatus } from '@orbit/shared';

/**
 * The agent mentions bookings, rooms, guests and conversations by ID in double brackets, e.g. `[[bk_147]]`
 * (see the system prompt). The thread turns those into chips that open the booking, and what
 * the agent's tools returned supplies the names, rooms and dates the chips show.
 */
export type EntityKind = 'booking' | 'room' | 'guest' | 'conversation';

export interface BookingEntity {
  kind: 'booking';
  id: string;
  guestName?: string;
  roomName?: string;
  checkIn?: string;
  checkOut?: string;
  status?: BookingStatus;
  adults?: number;
  childAges?: number[];
}

export interface RoomEntity {
  kind: 'room';
  id: string;
  name?: string;
}

export interface GuestEntity {
  kind: 'guest';
  id: string;
  name?: string;
}

/** An inbox conversation, named by who it is with. */
export interface ConversationEntity {
  kind: 'conversation';
  id: string;
  name?: string;
}

export type Entity = BookingEntity | RoomEntity | GuestEntity | ConversationEntity;

const prefixes: Record<string, EntityKind> = {
  bk: 'booking',
  rm: 'room',
  gst: 'guest',
  inq: 'conversation',
};

export function entityKind(id: string): EntityKind | null {
  return prefixes[id.slice(0, id.indexOf('_'))] ?? null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** Keeps what is already known and adds what the new sighting knows. */
function merge(map: Map<string, Entity>, entity: Entity) {
  const known = map.get(entity.id);
  const defined = Object.fromEntries(Object.entries(entity).filter(([, v]) => v !== undefined));
  map.set(entity.id, { ...known, ...defined } as Entity);
}

function bookingFrom(booking: Obj, extra: Obj): BookingEntity | null {
  const id = str(booking.id);
  if (!id || entityKind(id) !== 'booking') return null;
  return {
    kind: 'booking',
    id,
    guestName: str(extra.guestName) ?? str(isObj(extra.guest) ? extra.guest.name : undefined),
    roomName: str(extra.roomName) ?? str(isObj(extra.room) ? extra.room.name : undefined),
    checkIn: str(booking.checkIn),
    checkOut: str(booking.checkOut),
    status: str(booking.status) as BookingStatus | undefined,
    adults: typeof booking.adults === 'number' ? booking.adults : undefined,
    childAges: Array.isArray(booking.childAges) ? (booking.childAges as number[]) : undefined,
  };
}

/** Everything a tool output says about bookings, rooms and guests, walked recursively. */
function collect(value: unknown, map: Map<string, Entity>) {
  if (Array.isArray(value)) {
    for (const v of value) collect(v, map);
    return;
  }
  if (!isObj(value)) return;
  // A booking summary or detail: `{ booking, guestName | guest, roomName | room }`.
  if (isObj(value.booking)) {
    const b = bookingFrom(value.booking, value);
    if (b) merge(map, b);
  }
  // A compact booking from the agent tools, or an item naming one: `{ bookingId, guestName, … }`.
  const bookingId = str(value.bookingId);
  if (bookingId && entityKind(bookingId) === 'booking' && (value.guestName || value.roomName)) {
    const b = bookingFrom({ ...value, id: bookingId }, value);
    if (b) merge(map, b);
  }
  const id = str(value.id);
  const name = str(value.name);
  if (id && name && entityKind(id) === 'room') merge(map, { kind: 'room', id, name });
  if (id && name && entityKind(id) === 'guest') merge(map, { kind: 'guest', id, name });
  const roomId = str(value.roomId);
  const roomName = str(value.roomName);
  if (roomId && roomName) merge(map, { kind: 'room', id: roomId, name: roomName });
  const guestId = str(value.guestId);
  const guestName = str(value.guestName);
  if (guestId && guestName) merge(map, { kind: 'guest', id: guestId, name: guestName });
  const inquiryId = str(value.inquiryId);
  const senderName = str(value.senderName);
  if (inquiryId && senderName && entityKind(inquiryId) === 'conversation') {
    merge(map, { kind: 'conversation', id: inquiryId, name: senderName });
  }
  for (const v of Object.values(value)) collect(v, map);
}

/** The bookings, rooms and guests found in tool outputs, by ID. */
export function collectEntities(outputs: unknown[]): Map<string, Entity> {
  const map = new Map<string, Entity>();
  for (const output of outputs) collect(output, map);
  return map;
}

export type Inline =
  { type: 'text'; text: string; strong?: boolean } | { type: 'mention'; id: string };

/** A paragraph, or a list whose items may each lead with a booking or room (shown as a row). */
export type AnswerBlock =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; items: { lead: string | null; content: Inline[] }[] };

// `[[bk_147]]`, or a bare ID the model forgot to bracket.
const MENTION = /\[\[((?:bk|rm|gst|inq)_[A-Za-z0-9-]+)\]\]|\b((?:bk|rm|gst|inq)_[A-Za-z0-9-]+)\b/g;
const LIST_ITEM = /^\s*(?:[-•*]|\d+[.)])\s+/;

/** Text with mentions and `**bold**`, as inline pieces. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (t: string) => {
    // Markdown emphasis is asked against but still happens; keep the words, drop the stars.
    t.split(/(\*\*[^*]+\*\*)/).forEach((piece) => {
      if (!piece) return;
      if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
        out.push({ type: 'text', text: piece.slice(2, -2), strong: true });
      } else {
        out.push({ type: 'text', text: piece });
      }
    });
  };
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    pushText(text.slice(last, m.index));
    out.push({ type: 'mention', id: (m[1] ?? m[2])! });
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/**
 * "[[bk_147]] — 2 adults" → the booking (or room) and what follows, without the joining
 * punctuation.
 */
function splitLead(text: string): { lead: string | null; rest: string } {
  const m = /^\s*(?:\[\[)?((?:bk|rm)_[A-Za-z0-9-]+)(?:\]\])?\s*(?:[—–:,-]\s*)?/.exec(text);
  return m ? { lead: m[1]!, rest: text.slice(m[0].length) } : { lead: null, rest: text };
}

/** The agent's answer as paragraphs and lists, with mentions picked out. */
export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    const joined = paragraph.join('\n').trim();
    if (joined) blocks.push({ type: 'paragraph', content: parseInline(joined) });
    paragraph = [];
  };
  for (const line of text.split('\n')) {
    if (LIST_ITEM.test(line)) {
      flush();
      const { lead, rest } = splitLead(line.replace(LIST_ITEM, ''));
      const item = { lead, content: parseInline(rest.trim()) };
      const prev = blocks.at(-1);
      if (prev?.type === 'list') prev.items.push(item);
      else blocks.push({ type: 'list', items: [item] });
    } else if (line.trim() === '') {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
