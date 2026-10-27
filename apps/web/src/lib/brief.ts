import type { DailyBrief } from '@orbit/shared';
import { formatDate, formatDateTime } from '@/lib/format';
import { roomStatusLabels } from '@/lib/status';

export type AttentionKind =
  'prepare' | 'hold' | 'messages' | 'out_of_order' | 'maintenance' | 'gap';

/** One line in the brief's "needs attention" list, with where to go to deal with it. */
export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  /** `?booking=` opens the booking inspector on the current page. */
  target: { path: string } | { bookingId: string };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Share of sellable rooms taken tonight, as a whole percentage. */
export function occupancyPercent({ occupied, sellable }: DailyBrief['occupancy']): number {
  return sellable === 0 ? 0 : Math.round((occupied / sellable) * 100);
}

/** The brief's action items, most urgent first: rooms to get ready, decisions, repairs. */
export function attentionItems(brief: DailyBrief): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const r of brief.roomsToPrepare) {
    items.push({
      id: `prepare:${r.roomId}`,
      kind: 'prepare',
      title: `Room ${r.roomName} is ${roomStatusLabels[r.status].toLowerCase()}`,
      detail: `${r.guestName} arrives today`,
      target: { path: '/housekeeping' },
    });
  }
  for (const { summary, expired } of brief.holds) {
    const { booking } = summary;
    items.push({
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
  if (brief.unansweredMessages > 0) {
    items.push({
      id: 'messages',
      kind: 'messages',
      title: `${plural(brief.unansweredMessages, 'message')} waiting for a reply`,
      detail: 'The agent prepares a reply when you open one',
      target: { path: '/inbox' },
    });
  }
  for (const r of brief.outOfOrder) {
    items.push({
      id: `ooo:${r.roomId}`,
      kind: 'out_of_order',
      title: `Room ${r.roomName} is out of order`,
      detail: 'Not offered to guests until repaired and cleaned',
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
