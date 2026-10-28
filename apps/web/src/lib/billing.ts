import type { Booking, VatBracket } from '@orbit/shared';

/** Extras can be posted while the stay is confirmed or in house; the domain checks the same. */
export function canCharge(booking: Pick<Booking, 'status'>): boolean {
  return booking.status === 'confirmed' || booking.status === 'checked_in';
}

/** What the last line of a bill says about its balance. */
export function balanceLabel(balance: number): string {
  if (balance > 0) return 'Balance due';
  if (balance < 0) return 'Owed to guest';
  return 'Paid in full';
}

export const vatBracketLabels: Record<VatBracket, string> = {
  standard: 'Standard',
  reduced: 'Reduced',
  none: 'No VAT',
};

/** "12%" for a bracket at its current rate, "No VAT" outside VAT. */
export function vatRateLabel(bracket: VatBracket, rate: number): string {
  return bracket === 'none' ? vatBracketLabels.none : `${rate}%`;
}
