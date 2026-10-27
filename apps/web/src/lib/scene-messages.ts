import type { DailyBrief, DayOverview } from '@orbit/shared';
import { formatDate } from '@/lib/format';
import { occupancyPercent } from '@/lib/brief';

/** Longest readout, in characters, so lines fit the scene beside the panel. */
const MAX_LENGTH = 46;

const clip = (line: string) =>
  line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH - 1).trimEnd()}…` : line;
const plural = (n: number, one: string, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;

/** Takes one item from each list in turn, so consecutive readouts are about different things. */
function interleave(groups: string[][]): string[] {
  const out: string[] = [];
  for (let i = 0; groups.some((g) => i < g.length); i++) {
    for (const g of groups) if (i < g.length) out.push(g[i]!);
  }
  return out;
}

/**
 * Readouts of what is happening at the demo hotel today, for the welcome scene: who arrives and
 * leaves, rooms to get ready, holds, repairs, messages and empty nights, in capitals.
 */
export function sceneMessages(brief: DailyBrief, day: DayOverview | undefined): string[] {
  const occupancy = [
    `OCC ${occupancyPercent(brief.occupancy)}% · ${brief.occupancy.occupied} OF ${brief.occupancy.total} ROOMS TONIGHT`,
    `${brief.guestsTonight} GUESTS IN HOUSE · ${brief.arrivals} IN · ${brief.departures} OUT`,
  ];
  const arrivals = (day?.arrivals ?? [])
    .slice(0, 4)
    .map((s) => `RM ${s.roomName} · ${s.guestName.toUpperCase()} · ARRIVING`);
  const departures = (day?.departures ?? [])
    .slice(0, 3)
    .map((s) => `RM ${s.roomName} · ${s.guestName.toUpperCase()} · CHECKING OUT`);
  const rooms = [
    ...brief.roomsToPrepare.map(
      (r) => `RM ${r.roomName} · ${r.status.replace('_', ' ').toUpperCase()} · GUEST DUE TODAY`,
    ),
    ...brief.maintenance.map(
      (m) =>
        `RM ${m.roomName} · REPAIR · ${(m.notes ?? 'Open task').replace(/\.$/, '').toUpperCase()}`,
    ),
  ].slice(0, 3);
  const desk = [
    ...brief.holds
      .slice(0, 2)
      .map((h) => `HOLD · ${h.summary.guestName.toUpperCase()} · RM ${h.summary.roomName}`),
    ...(brief.unansweredMessages > 0
      ? [`${plural(brief.unansweredMessages, 'GUEST MESSAGE')} WAITING`]
      : []),
    ...brief.gaps
      .slice(0, 2)
      .map(
        (g) =>
          `RM ${g.roomName} · ${plural(g.nights, 'EMPTY NIGHT')} · ${formatDate(g.from).toUpperCase()}`,
      ),
  ];
  return interleave([arrivals, occupancy, departures, rooms, desk]).map(clip);
}
