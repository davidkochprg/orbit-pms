import type { RevenueOutlook } from '@orbit/shared';

export const percentText = (p: number) => `${p > 0 ? '+' : ''}${p}%`;

/** The outlook in the words the agent should repeat: percents as text, occupancy rounded. */
export function compactOutlook(outlook: RevenueOutlook) {
  return {
    today: outlook.today,
    nights: outlook.nights.map((n) => ({
      date: n.date,
      occupancy: `${Math.round((n.roomsSold / Math.max(n.roomsTotal, 1)) * 100)}% (${n.roomsSold} of ${n.roomsTotal} rooms)`,
      usualForWeekday:
        n.typicalOccupancy === null ? null : `${Math.round(n.typicalOccupancy * 100)}%`,
      currentRate: percentText(n.currentPercent),
      suggestedRate: percentText(n.suggestedPercent),
      reasons: n.factors.map(
        (f) => `${f.label} ${percentText(f.percent)}${f.detail ? ` (${f.detail})` : ''}`,
      ),
      events: n.events,
      weather: n.weather && `${n.weather.kind}, ${n.weather.tempMinC} to ${n.weather.tempMaxC} °C`,
      expectedNoShows: n.expectedNoShows,
    })),
    arrivalRisks: outlook.arrivalRisks.map((r) => ({
      bookingId: r.bookingId,
      guestName: r.guestName,
      roomName: r.roomName,
      checkIn: r.checkIn,
      chance: `${Math.round(r.chance * 100)}%`,
      reasons: r.reasons,
    })),
    weatherAvailable: outlook.weatherAvailable,
  };
}

/** Every percent the outlook states, as numbers without sign, so a text can be checked against it. */
export function outlookPercents(outlook: RevenueOutlook): Set<number> {
  const all = new Set<number>();
  for (const n of outlook.nights) {
    all.add(Math.abs(n.currentPercent));
    all.add(Math.abs(n.suggestedPercent));
    all.add(Math.round((n.roomsSold / Math.max(n.roomsTotal, 1)) * 100));
    if (n.typicalOccupancy !== null) all.add(Math.round(n.typicalOccupancy * 100));
    for (const f of n.factors) all.add(Math.abs(f.percent));
  }
  for (const r of outlook.arrivalRisks) all.add(Math.round(r.chance * 100));
  return all;
}

/** Percents a text states that the outlook does not, e.g. a rate the model worked out itself. */
export function unknownPercents(text: string, known: Set<number>): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s?(?:%|percent)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => !known.has(n));
}
