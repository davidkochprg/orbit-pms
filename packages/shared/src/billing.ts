import { z } from 'zod';
import { isoDateSchema } from './dates';
import { currencySchema, moneySchema } from './quote';
import { taxModeSchema } from './rates';

export const paymentMethods = ['cash', 'card', 'bank_transfer'] as const;
export const paymentMethodSchema = z.enum(paymentMethods);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** A refund pays money back to the guest; its amount is still positive. */
export const paymentKinds = ['payment', 'refund'] as const;
export const paymentKindSchema = z.enum(paymentKinds);
export type PaymentKind = z.infer<typeof paymentKindSchema>;

/**
 * VAT brackets for bill lines. Prices include VAT; `none` is outside VAT, e.g. city tax. The rate
 * of each bracket comes from the pricing config.
 */
export const vatBrackets = ['standard', 'reduced', 'none'] as const;
export const vatBracketSchema = z.enum(vatBrackets);
export type VatBracket = z.infer<typeof vatBracketSchema>;

/** Something posted to a booking's bill besides the stay, e.g. "Sauna" or "Minibar". */
export const chargeSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  label: z.string(),
  quantity: z.number().int().positive(),
  /** Whole units of the hotel's currency; negative for a manual discount. */
  unitPrice: moneySchema,
  amount: moneySchema,
  vatBracket: vatBracketSchema,
  /** The hotel day it was posted. */
  postedOn: isoDateSchema,
  createdAt: z.iso.datetime(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const paymentSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  kind: paymentKindSchema,
  method: paymentMethodSchema,
  amount: moneySchema.positive(),
  note: z.string().nullable(),
  /** The hotel day it was received or paid back. */
  paidOn: isoDateSchema,
  createdAt: z.iso.datetime(),
});
export type Payment = z.infer<typeof paymentSchema>;

const chargeFields = {
  label: z.string().trim().min(1).max(80).describe('What it is, e.g. "Sauna" or "Minibar".'),
  quantity: z.number().int().min(1).max(99),
  unitPrice: moneySchema
    .refine((n) => n !== 0, 'A charge needs an amount')
    .refine((n) => Math.abs(n) <= 1_000_000, 'Too large')
    .describe(
      "Whole units of the hotel's currency per unit, as the guest or staff stated it. Negative for a discount.",
    ),
  vatBracket: vatBracketSchema.describe(
    'VAT bracket: "standard" for most goods and services, "reduced" for food and accommodation, "none" for items outside VAT.',
  ),
};

export const newChargeBodySchema = z.object({
  ...chargeFields,
  quantity: chargeFields.quantity.default(1),
  vatBracket: chargeFields.vatBracket.default('standard'),
});
export type NewChargeBody = z.infer<typeof newChargeBodySchema>;

/** `PATCH /api/bookings/:id/charges/:chargeId`: any fields of an extra to change. */
export const chargePatchSchema = z
  .object(chargeFields)
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Nothing to change');
export type ChargePatch = z.infer<typeof chargePatchSchema>;

export const newPaymentBodySchema = z.object({
  kind: paymentKindSchema.default('payment'),
  method: paymentMethodSchema,
  amount: moneySchema
    .positive()
    .max(10_000_000)
    .describe("Whole units of the hotel's currency, always positive."),
  note: z.string().trim().max(200).nullable().default(null),
});
export type NewPaymentBody = z.infer<typeof newPaymentBodySchema>;

/** `tax`: a tax added on top of the other lines, when prices don't include it. */
export const folioLineKinds = ['stay', 'city_tax', 'extra', 'tax'] as const;
export const folioLineKindSchema = z.enum(folioLineKinds);
export type FolioLineKind = z.infer<typeof folioLineKindSchema>;

export const folioLineSchema = z.object({
  kind: folioLineKindSchema,
  label: z.string(),
  quantity: z.number().int(),
  unitPrice: moneySchema,
  amount: moneySchema,
  vatBracket: vatBracketSchema,
  /** Percent of the bracket, e.g. 12 or 9.25. */
  vatRate: z.number().nonnegative(),
  /** Set for extras, so one can be edited or removed. */
  chargeId: z.string().nullable(),
});
export type FolioLine = z.infer<typeof folioLineSchema>;

/** The tax in one bracket of a bill. `gross = net + vat`, rounded to whole units per bracket. */
export const vatSummaryLineSchema = z.object({
  bracket: vatBracketSchema,
  /** What the bracket's tax is called, e.g. "VAT" or "Occupancy tax"; null outside tax. */
  label: z.string().nullable(),
  rate: z.number().nonnegative(),
  gross: moneySchema,
  net: moneySchema,
  vat: moneySchema,
});
export type VatSummaryLine = z.infer<typeof vatSummaryLineSchema>;

/** A booking's bill: what is charged, what is paid, and what is still owed. */
export const folioSchema = z.object({
  bookingId: z.string(),
  lines: z.array(folioLineSchema),
  payments: z.array(paymentSchema),
  /** Sum of the lines. */
  charged: moneySchema,
  /** Payments minus refunds. */
  paid: moneySchema,
  /** `charged - paid`; negative when the guest is owed money. */
  balance: moneySchema,
  /** One line per bracket with charges, standard first. */
  vat: z.array(vatSummaryLineSchema),
  /** Whether the stay and extras include tax, or the `tax` lines add it on top. */
  taxMode: taxModeSchema,
  currency: currencySchema,
});
export type Folio = z.infer<typeof folioSchema>;
