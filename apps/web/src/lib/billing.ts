import type { Booking, TaxConfig, VatBracket } from '@orbit/shared';

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

/** Fallback names of the brackets, until the hotel's own tax names have loaded. */
export const vatBracketLabels: Record<VatBracket, string> = {
  standard: 'Standard',
  reduced: 'Lodging',
  none: 'No tax',
};

/** "Sales tax (8.75%)" for a bracket with the hotel's tax names and rates, e.g. in a select. */
export function bracketLabel(bracket: VatBracket, tax: TaxConfig | undefined): string {
  if (bracket === 'none' || !tax) return vatBracketLabels[bracket];
  return `${tax[bracket].label} (${tax[bracket].rate}%)`;
}

/** "12%" for a bracket at its current rate, "No tax" outside tax. */
export function vatRateLabel(bracket: VatBracket, rate: number): string {
  return bracket === 'none' ? vatBracketLabels.none : `${rate}%`;
}
