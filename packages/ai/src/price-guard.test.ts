import type { RoomBlock, StayOption } from '@orbit/shared';
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

  it('reads dollars, with or without zero cents', () => {
    expect(amountsInText('Your total is $1,250 plus tax.')).toEqual([1250]);
    expect(
      amountsInText('That comes to $1,250.00, or 980 USD for the shorter stay.').sort(
        (a, b) => a - b,
      ),
    ).toEqual([980, 1250]);
    expect(amountsInText('Rooms from US$ 159 a night')).toEqual([159]);
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

  it('accepts amounts the hotel profile states', () => {
    expect(checkDraftPrices('Parking costs 200 CZK per night.', [], [200]).ok).toBe(true);
  });

  it("needs a block's total, and allows its subtotals and rooms' prices", () => {
    const block: RoomBlock = {
      rooms: [option(6000, [3000]), option(6000, [3000]), option(4000)],
      byType: [
        { roomTypeName: 'Single', kind: 'room', count: 1, total: 4000 },
        { roomTypeName: 'Double', kind: 'room', count: 2, total: 12000 },
      ],
      total: 16000,
      currency: 'CZK',
    };
    expect(
      checkDraftPrices(
        '2 dvoulůžkové 12 000 Kč, 1 jednolůžkový 4 000 Kč, celkem 16 000 Kč.',
        [],
        [],
        block,
      ),
    ).toEqual({ ok: true, unexpected: [], missing: [] });
    expect(checkDraftPrices('Dvoulůžkový pokoj 6 000 Kč, noc 3 000 Kč.', [], [], block)).toEqual({
      ok: false,
      unexpected: [],
      missing: [16000],
    });
    expect(checkDraftPrices('Celkem 16 000 Kč, sleva 15 000 Kč.', [], [], block)).toEqual({
      ok: false,
      unexpected: [15000],
      missing: [],
    });
  });
});
