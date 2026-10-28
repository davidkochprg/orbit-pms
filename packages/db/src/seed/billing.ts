import { addDays, buildFolio, nightsBetween, type PricingConfig } from '@orbit/domain';
import type { Booking, Charge, IsoDate, Payment, PaymentMethod, VatBracket } from '@orbit/shared';
import { createRandom } from './random';

/** An extra the demo posts to bills. */
export interface SeedExtra {
  label: string;
  unitPrice: number;
  vatBracket: VatBracket;
  perAdult?: boolean;
  max?: number;
}

const settleMethods: PaymentMethod[] = ['card', 'card', 'card', 'cash', 'bank_transfer'];

/**
 * Bills for the demo bookings: extras for past and current stays, deposits for some upcoming ones,
 * and settled bills for guests who left. Guests leaving today still owe, so check-out has
 * something to collect. Uses its own PRNG, so the bookings stay as they are.
 */
export function buildBilling(
  bookings: Booking[],
  today: IsoDate,
  pricing: PricingConfig,
  extras: SeedExtra[],
): { charges: Charge[]; payments: Payment[] } {
  const random = createRandom(7);
  const charges: Charge[] = [];
  const payments: Payment[] = [];
  const at = (day: IsoDate) => `${day}T10:00:00.000Z`;

  function charge(b: Booking, day: IsoDate) {
    const extra = random.pick(extras);
    const quantity = extra.perAdult ? b.adults : random.int(1, extra.max ?? 1);
    charges.push({
      id: `chg_${String(charges.length + 1).padStart(4, '0')}`,
      bookingId: b.id,
      label: extra.label,
      quantity,
      unitPrice: extra.unitPrice,
      amount: quantity * extra.unitPrice,
      vatBracket: extra.vatBracket,
      postedOn: day,
      createdAt: at(day),
    });
  }

  function pay(
    b: Booking,
    amount: number,
    method: PaymentMethod,
    day: IsoDate,
    note: string | null,
  ) {
    if (amount <= 0) return;
    payments.push({
      id: `pay_${String(payments.length + 1).padStart(4, '0')}`,
      bookingId: b.id,
      kind: 'payment',
      method,
      amount,
      note,
      paidOn: day,
      createdAt: at(day),
    });
  }

  // About 30% of the stay, rounded to tens of dollars or hundreds of crowns.
  const step = pricing.currency === 'CZK' ? 100 : 10;
  const deposit = (b: Booking) => Math.round(((b.priceSnapshot?.total ?? 0) * 0.3) / step) * step;

  for (const b of bookings) {
    const staying = b.status === 'checked_out' || b.status === 'checked_in';
    if (staying) {
      // Extras on nights that have already happened.
      const lastNight = addDays(b.checkOut, -1);
      const lastDay = lastNight < today ? lastNight : today;
      const days = nightsBetween(b.checkIn, addDays(lastDay, 1));
      const count = random.int(0, Math.min(3, days));
      for (let i = 0; i < count; i++) charge(b, addDays(b.checkIn, random.int(0, days - 1)));
    }

    const hasDeposit =
      (staying || b.status === 'confirmed') && random.chance(b.checkIn > today ? 0.4 : 0.5);
    let paid = 0;
    if (hasDeposit) {
      const day = addDays(b.checkIn > today ? today : b.checkIn, -random.int(3, 20));
      paid = deposit(b);
      pay(b, paid, 'bank_transfer', day, 'Deposit');
    }

    if (b.status === 'checked_out') {
      const folio = buildFolio(
        b,
        charges.filter((c) => c.bookingId === b.id),
        [],
        pricing,
      );
      pay(b, folio.charged - paid, random.pick(settleMethods), b.checkOut, null);
    }
  }
  return { charges, payments };
}
