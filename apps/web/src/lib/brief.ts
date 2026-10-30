import type { BookingSummary, DailyBrief } from '@orbit/shared';
import { formatDate, formatDateTime } from '@/lib/format';
import { roomStatusLabels } from '@/lib/status';

export type AttentionKind =
  'prepare' | 'ids' | 'hold' | 'messages' | 'out_of_order' | 'maintenance' | 'gap';

/** One line in the brief's "needs attention" list, with where to go to deal with it. */
export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail?: string;
  /**
   * `?booking=` opens the booking inspector on the current page; `items` opens into the rows it
   * stands for, when several of one kind would crowd the list.
   */
  target: { path: string } | { bookingId: string } | { items: AttentionItem[] };
}

/** From this many items of one kind they share a row that opens into them. */
const GROUP_FROM = 3;

/** "Rooms 101, 104, 201 and 2 more". */
function roomList(all: string[]): string {
  // Two holds can be for one room on different dates.
  const names = [...new Set(all)];
  if (names.length === 1) return `Room ${names[0]}`;
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `Rooms ${shown} and ${names.length - 3} more` : `Rooms ${shown}`;
}

/** Several items of one kind as one row, e.g. "8 stays still need an ID", or the items as they are. */
function grouped(
  items: AttentionItem[],
  kind: AttentionKind,
  title: string,
  roomNames: string[],
): AttentionItem[] {
  if (items.length < GROUP_FROM) return items;
  return [{ id: `${kind}:all`, kind, title, detail: roomList(roomNames), target: { items } }];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Share of sellable rooms taken tonight, as a whole percentage. */
export function occupancyPercent({ occupied, sellable }: DailyBrief['occupancy']): number {
  return sellable === 0 ? 0 : Math.round((occupied / sellable) * 100);
}

/** How many of today's arrivals are in, or departures out: "2 of 8". */
export function doneOf(rows: BookingSummary[], done: 'checked_in' | 'checked_out'): string {
  // A guest who arrived and already left today has arrived too.
  const finished = rows.filter(
    ({ booking }) => booking.status === done || booking.status === 'checked_out',
  ).length;
  return `${finished} of ${rows.length}`;
}

/** The brief's action items, most urgent first: rooms to get ready, IDs, decisions, repairs. */
export function attentionItems(brief: DailyBrief): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const r of brief.roomsToPrepare) {
    items.push({
      id: `prepare:${r.roomId}`,
      kind: 'prepare',
      // A clean room only waits for its inspection; any other status means work to do.
      title:
        r.status === 'clean'
          ? `Room ${r.roomName} needs inspecting`
          : `Room ${r.roomName} is ${roomStatusLabels[r.status].toLowerCase()}`,
      detail: `${r.guestName} arrives today`,
      target: { path: '/housekeeping' },
    });
  }
  const ids: AttentionItem[] = brief.missingIds.map(({ summary, missing, arriving }) => ({
    id: `ids:${summary.booking.id}`,
    kind: 'ids',
    title: `Room ${summary.roomName}: ${plural(missing, 'ID')} missing`,
    detail: `${summary.guestName} ${arriving ? 'arrives today' : 'is in house'}`,
    target: { bookingId: summary.booking.id },
  }));
  items.push(
    ...grouped(
      ids,
      'ids',
      `${plural(ids.length, 'stay')} still ${ids.length === 1 ? 'needs' : 'need'} an ID`,
      brief.missingIds.map((m) => m.summary.roomName),
    ),
  );
  const holds: AttentionItem[] = [];
  for (const { summary, expired } of brief.holds) {
    const { booking } = summary;
    holds.push({
      id: `hold:${booking.id}`,
      kind: 'hold',
      title: `Hold for ${summary.guestName} ${expired ? 'lapsed' : 'not confirmed'}`,
      detail: [
        `Room ${summary.roomName}, arrives ${formatDate(booking.checkIn)}`,
        !expired && booking.holdExpiresAt && `lapses ${formatDateTime(booking.holdExpiresAt)}`,
      ]
        .filter(Boolean)
        .join(', '),
      target: { bookingId: booking.id },
    });
  }
  items.push(
    ...grouped(
      holds,
      'hold',
      `${plural(holds.length, 'hold')} waiting for a decision`,
      brief.holds.map((h) => h.summary.roomName),
    ),
  );
  if (brief.unansweredMessages > 0) {
    items.push({
      id: 'messages',
      kind: 'messages',
      title: `${plural(brief.unansweredMessages, 'message')} waiting for a reply`,
      target: { path: '/inbox' },
    });
  }
  for (const r of brief.outOfOrder) {
    items.push({
      id: `ooo:${r.roomId}`,
      kind: 'out_of_order',
      title: `Room ${r.roomName} is out of order`,
      target: { path: '/housekeeping' },
    });
  }
  for (const t of brief.maintenance) {
    items.push({
      id: `task:${t.taskId}`,
      kind: 'maintenance',
      title: `Room ${t.roomName} needs a repair`,
      detail: t.notes ?? 'Maintenance task open',
      target: { path: '/housekeeping' },
    });
  }
  return items;
}

/** Short empty runs between stays, soonest first: rooms worth offering at a discount. */
export function gapItems(brief: DailyBrief): AttentionItem[] {
  return brief.gaps.map((g) => ({
    id: `gap:${g.roomId}:${g.from}`,
    kind: 'gap',
    title: `Room ${g.roomName}, ${plural(g.nights, 'night')}`,
    detail:
      g.nights === 1
        ? `Night of ${formatDate(g.from)}`
        : `From ${formatDate(g.from)}, next guest ${formatDate(g.to)}`,
    target: { path: `/tape-chart?from=${g.from}` },
  }));
}
