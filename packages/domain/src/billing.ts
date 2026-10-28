import {
  type AuditActor,
  type Booking,
  type Charge,
  type ChargePatch,
  type Folio,
  type FolioLine,
  type NewChargeBody,
  type NewPaymentBody,
  type Payment,
  type PricingConfig,
  type QuoteLineKind,
  type VatBracket,
  vatBrackets,
  type VatSummaryLine,
} from '@orbit/shared';
import { hotelToday, nightsBetween } from './dates';
import { DomainError } from './errors';
import { currentPricing } from './rates';
import type { Repositories } from './repositories';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const sum = (amounts: number[]) => amounts.reduce((a, b) => a + b, 0);

/**
 * The VAT bracket of each part of the stay. Accommodation and what belongs to it (discounts, extra
 * beds) is reduced-rate in Czechia.
 * TODO(David): confirm wellness and dogs are billed at the standard rate.
 */
export const stayVatBrackets: Record<QuoteLineKind, VatBracket> = {
  accommodation: 'reduced',
  child_discount: 'reduced',
  long_stay_discount: 'reduced',
  extra_bed: 'reduced',
  wellness: 'standard',
  dog: 'standard',
};

export function vatRate(bracket: VatBracket, pricing: PricingConfig): number {
  return bracket === 'none' ? 0 : pricing.vat[bracket];
}

/** Rounds half away from zero, so a discount's VAT mirrors a charge's. */
const roundCzk = (n: number) => Math.sign(n) * Math.round(Math.abs(n));

/**
 * VAT per bracket, worked out from the VAT-inclusive total of each bracket (not per line), so the
 * rounding happens once per bracket. Brackets with nothing charged are left out.
 */
export function vatSummary(lines: FolioLine[]): VatSummaryLine[] {
  return vatBrackets.flatMap((bracket) => {
    const inBracket = lines.filter((l) => l.vatBracket === bracket);
    if (inBracket.length === 0) return [];
    const rate = inBracket[0]!.vatRate;
    const gross = sum(inBracket.map((l) => l.amount));
    const vat = roundCzk((gross * rate) / (100 + rate));
    return [{ bracket, rate, gross, net: gross - vat, vat }];
  });
}

/** Guests who pay city tax: every adult, and children from the tax's minimum age. */
export function cityTaxPayers(booking: Pick<Booking, 'adults' | 'childAges'>, minAge: number) {
  return booking.adults + booking.childAges.filter((age) => age >= minAge).length;
}

/** The city tax line for a stay, or null when nobody pays it or the rate is zero. */
export function cityTaxLine(booking: Booking, pricing: PricingConfig): FolioLine | null {
  const { perPersonPerNight, minAge } = pricing.cityTax;
  const payers = cityTaxPayers(booking, minAge);
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  if (perPersonPerNight === 0 || payers === 0) return null;
  return {
    kind: 'city_tax',
    label: `City tax, ${plural(payers, 'guest')} × ${plural(nights, 'night')}`,
    quantity: payers * nights,
    unitPrice: perPersonPerNight,
    amount: payers * nights * perPersonPerNight,
    vatBracket: 'none',
    vatRate: 0,
    chargeId: null,
  };
}

/**
 * A booking's bill. The stay is billed verbatim from the price it was booked at, then city tax at
 * the current rate, then extras. A cancelled booking bills only its extras, so whatever was paid
 * shows as owed back. Every line carries its VAT bracket at the current rates.
 */
export function buildFolio(
  booking: Booking,
  charges: Charge[],
  payments: Payment[],
  pricing: PricingConfig,
): Folio {
  const lines: FolioLine[] = [];
  if (booking.status !== 'cancelled') {
    for (const line of booking.priceSnapshot?.lines ?? []) {
      const { label, quantity, unitPrice, amount } = line;
      const vatBracket = stayVatBrackets[line.kind];
      lines.push({
        kind: 'stay',
        label,
        quantity,
        unitPrice,
        amount,
        vatBracket,
        vatRate: vatRate(vatBracket, pricing),
        chargeId: null,
      });
    }
    const tax = cityTaxLine(booking, pricing);
    if (tax) lines.push(tax);
  }
  for (const c of charges) {
    lines.push({
      kind: 'extra',
      label: c.label,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      amount: c.amount,
      vatBracket: c.vatBracket,
      vatRate: vatRate(c.vatBracket, pricing),
      chargeId: c.id,
    });
  }
  const charged = sum(lines.map((l) => l.amount));
  const paid = sum(payments.map((p) => (p.kind === 'refund' ? -p.amount : p.amount)));
  return {
    bookingId: booking.id,
    lines,
    payments,
    charged,
    paid,
    balance: charged - paid,
    vat: vatSummary(lines),
    currency: 'CZK',
  };
}

/** Extras go on confirmed and in-house stays; a hold is not a sale yet, and a checked-out bill is closed. */
export function assertCanCharge(booking: Booking): void {
  if (booking.status === 'confirmed' || booking.status === 'checked_in') return;
  const reason = {
    hold: 'Confirm the booking before adding charges',
    checked_out: 'The guest has checked out; the bill is closed for charges',
    cancelled: 'The booking is cancelled',
  }[booking.status];
  throw new DomainError('invalid_transition', reason);
}

/**
 * Payments are taken at any point before or after the stay; a cancelled booking only takes
 * refunds. A refund can't exceed what was paid.
 */
export function assertCanPay(booking: Booking, folio: Folio, body: NewPaymentBody): void {
  if (body.kind === 'payment' && booking.status === 'cancelled') {
    throw new DomainError(
      'invalid_transition',
      'The booking is cancelled; only refunds are possible',
    );
  }
  if (body.kind === 'refund' && body.amount > folio.paid) {
    throw new DomainError(
      'invalid_input',
      `Only ${folio.paid} CZK has been paid, so at most that can be refunded`,
    );
  }
}

export interface BillingDeps {
  repos: Repositories;
  /** Used until a manager saves rates. */
  pricing: PricingConfig;
  clock: () => Date;
  newId: (prefix: string) => string;
}

/** Bills: extras posted to bookings, payments and refunds. Every change is audited on the booking. */
export function createBillingService({ repos, pricing, clock, newId }: BillingDeps) {
  async function loadBooking(r: Repositories, id: string): Promise<Booking> {
    const booking = await r.bookings.getBooking(id);
    if (!booking) throw new DomainError('not_found', `Booking ${id} not found`);
    return booking;
  }

  async function loadCharge(r: Repositories, bookingId: string, chargeId: string) {
    const booking = await loadBooking(r, bookingId);
    const charge = await r.billing.getCharge(chargeId);
    if (!charge || charge.bookingId !== bookingId) {
      throw new DomainError('not_found', `Charge ${chargeId} not found on this booking`);
    }
    return { booking, charge };
  }

  async function folioOf(r: Repositories, booking: Booking): Promise<Folio> {
    return buildFolio(
      booking,
      await r.billing.listCharges({ bookingId: booking.id }),
      await r.billing.listPayments({ bookingId: booking.id }),
      await currentPricing(r, pricing),
    );
  }

  function newCharge(bookingId: string, body: NewChargeBody): Charge {
    const now = clock();
    return {
      id: newId('chg'),
      bookingId,
      label: body.label,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      amount: body.quantity * body.unitPrice,
      vatBracket: body.vatBracket,
      postedOn: hotelToday(now),
      createdAt: now.toISOString(),
    };
  }

  function newPayment(bookingId: string, body: NewPaymentBody): Payment {
    const now = clock();
    return {
      id: newId('pay'),
      bookingId,
      ...body,
      paidOn: hotelToday(now),
      createdAt: now.toISOString(),
    };
  }

  async function planCharge(r: Repositories, bookingId: string, body: NewChargeBody) {
    const booking = await loadBooking(r, bookingId);
    assertCanCharge(booking);
    const charge = newCharge(bookingId, body);
    const before = await folioOf(r, booking);
    return { booking, charge, balanceAfter: before.balance + charge.amount };
  }

  async function planChargeUpdate(
    r: Repositories,
    bookingId: string,
    chargeId: string,
    patch: ChargePatch,
  ) {
    const { booking, charge } = await loadCharge(r, bookingId, chargeId);
    assertCanCharge(booking);
    const quantity = patch.quantity ?? charge.quantity;
    const unitPrice = patch.unitPrice ?? charge.unitPrice;
    const updated: Charge = {
      ...charge,
      label: patch.label ?? charge.label,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
      vatBracket: patch.vatBracket ?? charge.vatBracket,
    };
    if (JSON.stringify(updated) === JSON.stringify(charge)) {
      throw new DomainError('invalid_input', 'Nothing to change');
    }
    const before = await folioOf(r, booking);
    return {
      booking,
      charge,
      updated,
      balanceAfter: before.balance - charge.amount + updated.amount,
    };
  }

  async function planChargeRemoval(r: Repositories, bookingId: string, chargeId: string) {
    const { booking, charge } = await loadCharge(r, bookingId, chargeId);
    assertCanCharge(booking);
    const before = await folioOf(r, booking);
    return { booking, charge, balanceAfter: before.balance - charge.amount };
  }

  async function planPayment(r: Repositories, bookingId: string, body: NewPaymentBody) {
    const booking = await loadBooking(r, bookingId);
    const before = await folioOf(r, booking);
    assertCanPay(booking, before, body);
    const payment = newPayment(bookingId, body);
    const signed = payment.kind === 'refund' ? -payment.amount : payment.amount;
    return { booking, payment, balanceAfter: before.balance - signed };
  }

  return {
    async getFolio(bookingId: string): Promise<Folio> {
      return folioOf(repos, await loadBooking(repos, bookingId));
    },

    /** Checks a charge against current data without saving it, e.g. for an agent proposal. */
    previewCharge: (bookingId: string, body: NewChargeBody) => planCharge(repos, bookingId, body),

    async addCharge(bookingId: string, body: NewChargeBody, actor: AuditActor): Promise<Folio> {
      return repos.transaction(async (tx) => {
        const { booking, charge } = await planCharge(tx, bookingId, body);
        await tx.billing.createCharge(charge);
        await tx.audit.append({
          actor,
          action: 'folio.charge',
          subjectId: bookingId,
          payload: { chargeId: charge.id, label: charge.label, amount: charge.amount },
        });
        return folioOf(tx, booking);
      });
    },

    /** Checks a correction against current data without saving it, e.g. for an agent proposal. */
    previewChargeUpdate: (bookingId: string, chargeId: string, patch: ChargePatch) =>
      planChargeUpdate(repos, bookingId, chargeId, patch),

    /** Corrects an extra in place: what it is, how many, the price or its VAT bracket. */
    async updateCharge(
      bookingId: string,
      chargeId: string,
      patch: ChargePatch,
      actor: AuditActor,
    ): Promise<Folio> {
      return repos.transaction(async (tx) => {
        const { booking, updated } = await planChargeUpdate(tx, bookingId, chargeId, patch);
        await tx.billing.updateCharge(updated);
        await tx.audit.append({
          actor,
          action: 'folio.update_charge',
          subjectId: bookingId,
          payload: {
            chargeId,
            label: updated.label,
            amount: updated.amount,
            changed: Object.keys(patch),
          },
        });
        return folioOf(tx, booking);
      });
    },

    /** Checks a removal against current data without saving it, e.g. for an agent proposal. */
    previewChargeRemoval: (bookingId: string, chargeId: string) =>
      planChargeRemoval(repos, bookingId, chargeId),

    async removeCharge(bookingId: string, chargeId: string, actor: AuditActor): Promise<Folio> {
      return repos.transaction(async (tx) => {
        const { booking, charge } = await planChargeRemoval(tx, bookingId, chargeId);
        await tx.billing.deleteCharge(chargeId);
        await tx.audit.append({
          actor,
          action: 'folio.remove_charge',
          subjectId: bookingId,
          payload: { chargeId, label: charge.label, amount: charge.amount },
        });
        return folioOf(tx, booking);
      });
    },

    /** Checks a payment against current data without saving it, e.g. for an agent proposal. */
    previewPayment: (bookingId: string, body: NewPaymentBody) =>
      planPayment(repos, bookingId, body),

    async recordPayment(
      bookingId: string,
      body: NewPaymentBody,
      actor: AuditActor,
    ): Promise<Folio> {
      return repos.transaction(async (tx) => {
        const { booking, payment } = await planPayment(tx, bookingId, body);
        await tx.billing.createPayment(payment);
        await tx.audit.append({
          actor,
          action: payment.kind === 'refund' ? 'folio.refund' : 'folio.payment',
          subjectId: bookingId,
          payload: { paymentId: payment.id, method: payment.method, amount: payment.amount },
        });
        return folioOf(tx, booking);
      });
    },
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
