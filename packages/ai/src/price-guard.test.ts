import type { StayOption } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import { amountsInText, checkDraftPrices } from './price-guard';

const option = (total: number, lines: number[] = []): StayOption => ({
  roomId: 'rm_1',
  roomName: '1',
  roomTypeName: 'Double',
  kind: 'room',
  quote: {
    roomTypeId: 'rt',
    checkIn: '2026-11-06',
    checkOut: '2026-11-08',
    nights: 2,
    adults: 2,
    childAges: [],
    lines: lines.map((amount) => ({
      kind: 'accommodation',
      label: 'x',
      quantity: 1,
      unitPrice: amount,
      amount,
    })),
    total,
    currency: 'CZK',
  },
});

describe('amountsInText', () => {
  it('reads amounts in Czech, German, Polish and English styles', () => {
    expect(amountsInText('Cena je 12 500 Kč za pobyt.')).toEqual([12500]);
    expect(amountsInText('Der Preis beträgt 12.500 CZK.')).toEqual([12500]);
    expect(amountsInText('Total: CZK 12,500 for both nights')).toEqual([12500]);
    expect(amountsInText('Razem 4 000 CZK oraz 1200,- Kč')).toEqual([4000, 1200]);
  });

  it('ignores numbers that are not money', () => {
    expect(amountsInText('Check-in from 15:00, 2 adults, room 104, 6 November')).toEqual([]);
  });

  it('does not join a currency with a list number on the next line', () => {
    const list =
      '1. Dvoulůžkový pokoj: celkem 6 600 CZK\n2. Rodinný pokoj: celkem 6 600 CZK\n3. Apartmán';
    expect(amountsInText(list)).toEqual([6600, 6600]);
  });
});

describe('checkDraftPrices', () => {
  const options = [option(12500, [10000, 2500]), option(14000)];

  it('passes when every total is stated and nothing else', () => {
    expect(
      checkDraftPrices('Pokoj 12 500 Kč, apartmán 14 000 Kč (wellness 2 500 Kč).', options),
    ).toEqual({ ok: true, unexpected: [], missing: [] });
  });

  it('flags invented and missing prices', () => {
    expect(checkDraftPrices('Pokoj 12 400 Kč.', options)).toEqual({
      ok: false,
      unexpected: [12400],
      missing: [12500, 14000],
    });
  });

  it('flags any price in a reply that should contain none', () => {
    expect(checkDraftPrices('Parking costs 200 CZK per night.', [])).toEqual({
      ok: false,
      unexpected: [200],
      missing: [],
    });
    expect(checkDraftPrices('Yes, parking is free.', [])).toEqual({
      ok: true,
      unexpected: [],
      missing: [],
    });
  });
});
