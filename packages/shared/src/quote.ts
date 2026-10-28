import { z } from 'zod';

/** Whole units of the hotel's currency: dollars, crowns or euros. Never a float. */
export const moneySchema = z.number().int();

export const currencies = ['USD', 'EUR', 'CZK'] as const;
export const currencySchema = z.enum(currencies);
export type Currency = z.infer<typeof currencySchema>;

const groupThousands = (n: number, separator: string) =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, separator);

/**
 * An amount as Orbit writes it in text for guests, the model and the activity log: "$1,250"
 * or "-$150" in dollars, "12 500 CZK" or "980 EUR" otherwise. The price guard reads it back.
 */
export function formatMoney(amount: number, currency: Currency): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return currency === 'USD'
    ? `${sign}$${groupThousands(abs, ',')}`
    : `${sign}${groupThousands(abs, ' ')} ${currency}`;
}

export const quoteLineKinds = [
  'accommodation',
  'child_discount',
  'long_stay_discount',
  'wellness',
  'extra_bed',
  'dog',
] as const;
export const quoteLineKindSchema = z.enum(quoteLineKinds);
export type QuoteLineKind = z.infer<typeof quoteLineKindSchema>;

export const quoteLineSchema = z.object({
  kind: quoteLineKindSchema,
  label: z.string(),
  quantity: z.number().int().nonnegative(),
  unitPrice: moneySchema,
  amount: moneySchema,
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

export const quoteSchema = z.object({
  roomTypeId: z.string(),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  nights: z.number().int().positive(),
  adults: z.number().int().nonnegative(),
  childAges: z.array(z.number().int().nonnegative()),
  lines: z.array(quoteLineSchema),
  total: moneySchema,
  currency: currencySchema,
});
export type Quote = z.infer<typeof quoteSchema>;

export const quoteAddonsSchema = z.object({
  wellness: z.boolean().default(false),
  dogs: z.number().int().nonnegative().default(0),
  extraBeds: z.number().int().nonnegative().default(0),
});
export type QuoteAddons = z.infer<typeof quoteAddonsSchema>;
