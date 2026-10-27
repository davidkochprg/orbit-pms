import { z } from 'zod';

/** Whole CZK. Never a float. */
export const czkSchema = z.number().int();

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
  unitPrice: czkSchema,
  amount: czkSchema,
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
  total: czkSchema,
  currency: z.literal('CZK'),
});
export type Quote = z.infer<typeof quoteSchema>;

export const quoteAddonsSchema = z.object({
  wellness: z.boolean().default(false),
  dogs: z.number().int().nonnegative().default(0),
  extraBeds: z.number().int().nonnegative().default(0),
});
export type QuoteAddons = z.infer<typeof quoteAddonsSchema>;
