import { type Currency, formatMoney, type Report } from '@orbit/shared';

const sourceNames: Record<Report['bySource'][number]['source'], string> = {
  email: 'Email',
  phone: 'Phone',
  web: 'Website',
  ota: 'OTA',
  walk_in: 'Walk-in',
};

/** ISO weekdays, 1 for Monday, as the report numbers them. */
const weekdays = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pct = (fraction: number) => Math.round(fraction * 100);
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
const count = (n: number) => n.toLocaleString('en-US');

/** "+4%" against the period before, or nothing when there is nothing to compare with. */
function change(now: number, before: number | undefined): string {
  if (before === undefined || before === 0) return '';
  return `, ${signed(Math.round(((now - before) / Math.abs(before)) * 100))}% vs before`;
}

/** "Fri Oct 16", the way the summary should write a night. */
function night(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "1 night", "3–4 nights", "7+ nights". */
function stayLength({ minNights, maxNights }: Report['stayLengths'][number]): string {
  if (maxNights === null) return `${minNights}+ nights`;
  if (minNights === maxNights) return `${minNights} night${minNights === 1 ? '' : 's'}`;
  return `${minNights}–${maxNights} nights`;
}

/**
 * A period's report as lines of facts, every figure the summary may use already worked out:
 * changes against the period before, shares, ADR by source, room type and weekday, the guests
 * (returning, families, how long they stay) and the busiest and quietest nights. The agent reads
 * the same lines as a report's context. The summary's guard accepts only numbers that appear here.
 */
export function reportFacts(
  report: Report,
  previous: Report | null,
  currency: Currency,
  today: string,
): string {
  const money = (n: number) => formatMoney(n, currency);
  const p = previous ?? undefined;
  const lines = [
    `Period: ${night(report.from)} to ${night(report.to)} (${report.nights} nights), ${report.rooms} rooms.${report.from >= today ? ' These nights are still ahead: the figures are what is booked so far.' : report.to > today ? ' Part of this period is still ahead.' : ''}`,
    `Occupancy ${pct(report.occupancy)}% (${count(report.roomNightsSold)} of ${count(report.roomNightsAvailable)} room nights)${p ? `, ${signed(pct(report.occupancy) - pct(p.occupancy))} pts vs the ${report.nights} nights before (${pct(p.occupancy)}%)` : ''}.`,
    `ADR ${money(report.adr)}${change(report.adr, p?.adr)}${p ? ` (was ${money(p.adr)})` : ''}. RevPAR ${money(report.revpar)}${change(report.revpar, p?.revpar)}${p ? ` (was ${money(p.revpar)})` : ''}.`,
    `Room revenue ${money(report.roomRevenue)}${change(report.roomRevenue, p?.roomRevenue)}${p ? ` (was ${money(p.roomRevenue)})` : ''}. Add-ons ${money(report.addonRevenue)}. Extras on bills ${money(report.extrasRevenue)}. Total revenue per available room night (TRevPAR) ${money(report.trevpar)}.`,
    `Arrivals ${report.arrivals}${p ? ` (was ${p.arrivals})` : ''}. Average stay ${report.averageStay.toFixed(1)} nights${p ? ` (was ${p.averageStay.toFixed(1)})` : ''}. Cancellations ${report.cancellations}, ${pct(report.cancellationRate)}% of bookings${p ? ` (was ${p.cancellations}, ${pct(p.cancellationRate)}%)` : ''}.`,
  ];
  if (report.arrivals > 0) {
    const returning = pct(report.returningArrivals / report.arrivals);
    const before = p && p.arrivals > 0 ? `, was ${pct(p.returningArrivals / p.arrivals)}%` : '';
    lines.push(
      `Guests: ${report.returningArrivals} of ${report.arrivals} arrivals had stayed before (${returning}%${before}); ${report.arrivalsWithChildren} came with children. Stays by length: ${report.stayLengths
        .filter((s) => s.arrivals > 0)
        .map((s) => `${stayLength(s)} ${pct(s.arrivals / report.arrivals)}%`)
        .join('; ')}.`,
    );
  }
  const sold = report.roomNightsSold;
  if (sold > 0 && report.bySource.length > 0) {
    const share = (r: Report, source: string) => {
      const s = r.bySource.find((x) => x.source === source);
      return r.roomNightsSold > 0 && s ? pct(s.roomNights / r.roomNightsSold) : 0;
    };
    lines.push(
      `By source, share of room nights sold: ${[...report.bySource]
        .sort((a, b) => b.roomNights - a.roomNights)
        .map((s) => {
          const now = share(report, s.source);
          const delta = p ? now - share(p, s.source) : 0;
          return `${sourceNames[s.source]} ${now}% (${money(s.roomRevenue)}, ADR ${money(s.adr)}${p && delta !== 0 ? `, ${signed(delta)} pts` : ''})`;
        })
        .join('; ')}.`,
    );
  }
  if (report.byRoomType.length > 0) {
    lines.push(
      `By room type, occupancy and ADR: ${[...report.byRoomType]
        .sort((a, b) => b.occupancy - a.occupancy)
        .map((t) => `${t.roomTypeName} ${pct(t.occupancy)}% at ${money(t.adr)}`)
        .join('; ')}.`,
    );
  }
  if (report.days.length >= 7) {
    lines.push(
      `By weekday, occupancy and ADR: ${[...report.byWeekday]
        .sort((a, b) => b.occupancy - a.occupancy)
        .map(
          (d) =>
            `${weekdays[d.weekday]} ${pct(d.occupancy)}%${d.roomNights > 0 ? ` at ${money(d.adr)}` : ''}`,
        )
        .join('; ')}.`,
    );
    const sorted = [...report.days].sort((a, b) => b.occupancy - a.occupancy);
    const busiest = sorted[0]!;
    const quietest = sorted.at(-1)!;
    lines.push(
      `Busiest night ${night(busiest.date)} at ${pct(busiest.occupancy)}%; quietest ${night(quietest.date)} at ${pct(quietest.occupancy)}%.`,
    );
  }
  if (report.unpaidDepartures.length > 0) {
    const owed = report.unpaidDepartures.reduce((sum, u) => sum + u.balance, 0);
    lines.push(
      `${report.unpaidDepartures.length} guest${report.unpaidDepartures.length === 1 ? '' : 's'} left owing ${money(owed)} together.`,
    );
  }
  return lines.join('\n');
}

export const reportSummarySystemPrompt = `You are the hotel's revenue manager, telling the general manager in a few words how a period went. Three short sentences, at most 70 words, plain prose: no lists, no headings, no Markdown.

1. The headline: occupancy and the average rate, and whether they rose or fell against the period before.
2. Why: the one or two things in the facts that explain it best, e.g. a booking source that grew or shrank or sells cheaper, a room type selling well or badly, the weekdays that are full or empty, cancellations, returning guests, or shorter stays.
3. One practical thing to do next, e.g. a promotion for the quiet weekdays, pushing the direct channels, or chasing the money guests still owe.

Write your own sentences, like a colleague would say them; never copy the wording of the facts. Use at most six figures in all, only the ones that make the point. Every figure must appear in the facts exactly as written there, e.g. "$199", "44%", "+4 pts", "Fri, Oct 16". Never calculate, add up, round or estimate, and never write a number that isn't in the facts, not even a year. "Extras on bills" is money earned from extras, not money owed. Write a change with its sign as given ("+4 pts") or in words ("up 4 pts"), never both ("up +4 pts").`;

export function reportSummaryPrompt(facts: string, feedback?: string): string {
  return `Facts:\n${facts}${feedback ? `\n\nYour previous summary was rejected: ${feedback}` : ''}`;
}
