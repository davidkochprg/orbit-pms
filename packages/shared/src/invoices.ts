import { z } from 'zod';
import {
  paymentKindSchema,
  paymentMethodSchema,
  vatBracketSchema,
  vatSummaryLineSchema,
} from './billing';
import { isoDateSchema } from './dates';
import { currencySchema, moneySchema } from './quote';
import { taxModeSchema } from './rates';

/**
 * `invoice` asks for payment by bank transfer by a due date; `receipt` confirms what was paid at
 * the property by cash or card.
 */
export const invoiceKinds = ['invoice', 'receipt'] as const;
export const invoiceKindSchema = z.enum(invoiceKinds);
export type InvoiceKind = z.infer<typeof invoiceKindSchema>;

export const invoiceKindLabels: Record<InvoiceKind, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
};

/** An issued document never changes; a mistake is fixed by voiding it and issuing a new one. */
export const invoiceStatuses = ['issued', 'void'] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === '' ? null : s));

/** Who an invoice is made out to: the guest, or the company they bill. */
export const billingPartySchema = z.object({
  name: z.string().trim().min(1, 'Add a name').max(120),
  /** The company billed, when it isn't the guest personally. */
  company: optionalText(120),
  /** Street, city and country, one per line. */
  address: optionalText(300),
  /** The buyer's VAT or tax ID, for a company. */
  taxId: optionalText(40),
  email: z
    .union([z.literal(''), z.email()])
    .nullable()
    .transform((s) => (s === '' ? null : s)),
});
export type BillingParty = z.infer<typeof billingPartySchema>;

/** The hotel as the seller, copied onto each document when it is issued. */
export const invoiceIssuerSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  taxId: z.string().nullable(),
  bankAccount: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
});
export type InvoiceIssuer = z.infer<typeof invoiceIssuerSchema>;

export const invoiceLineSchema = z.object({
  label: z.string(),
  quantity: z.number().int(),
  unitPrice: moneySchema,
  amount: moneySchema,
  vatBracket: vatBracketSchema,
  vatRate: z.number().nonnegative(),
  /** A tax added on top of the other lines. */
  isTax: z.boolean(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoicePaymentSchema = z.object({
  kind: paymentKindSchema,
  method: paymentMethodSchema,
  amount: moneySchema.positive(),
  paidOn: isoDateSchema,
});
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>;

/**
 * An invoice or receipt for a booking's bill: the bill as it stood when it was issued, with the
 * hotel's and the buyer's details, frozen. Numbers run per kind and year without gaps, and a
 * voided document keeps its number.
 */
export const invoiceSchema = z.object({
  id: z.string(),
  /** "INV-2026-0007" or "RCT-2026-0012". */
  number: z.string(),
  kind: invoiceKindSchema,
  status: invoiceStatusSchema,
  bookingId: z.string(),
  guestId: z.string(),
  issuedOn: isoDateSchema,
  /** When an invoice is to be paid by; null for a receipt. */
  dueOn: isoDateSchema.nullable(),
  /** The stay it bills. */
  stay: z.object({ checkIn: isoDateSchema, checkOut: isoDateSchema, roomName: z.string() }),
  issuer: invoiceIssuerSchema,
  buyer: billingPartySchema,
  lines: z.array(invoiceLineSchema),
  vat: z.array(vatSummaryLineSchema),
  taxMode: taxModeSchema,
  currency: currencySchema,
  /** The bill's total. */
  total: moneySchema,
  /** Payments minus refunds by the time it was issued. */
  paid: moneySchema,
  /** `total - paid`: what is still to pay; zero or less when settled. */
  due: moneySchema,
  payments: z.array(invoicePaymentSchema),
  /** What a bank transfer quotes so the payment can be matched, e.g. "20260007". */
  paymentReference: z.string().nullable(),
  note: z.string().nullable(),
  /** Who issued it, when staff did. */
  issuedBy: z.string().nullable(),
  voidedOn: isoDateSchema.nullable(),
  voidReason: z.string().nullable(),
  /** The document issued in its place, when it was voided and reissued. */
  replacedBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

/**
 * An issued document with how its bill stands now: `settled` once the bill is paid, `outdated`
 * when the bill changed since it was issued, so it no longer matches.
 */
export const invoiceViewSchema = invoiceSchema.extend({
  guestName: z.string(),
  settled: z.boolean(),
  outdated: z.boolean(),
  overdue: z.boolean(),
});
export type InvoiceView = z.infer<typeof invoiceViewSchema>;

const noteField = optionalText(300).describe(
  'A line printed on the document, e.g. a purchase order number. Usually null.',
);

/** `POST /api/bookings/:id/invoices`. */
export const issueInvoiceBodySchema = z.object({
  kind: invoiceKindSchema.describe(
    '"invoice" to ask for payment by bank transfer by a due date; "receipt" for what the guest paid at the property by cash or card.',
  ),
  /** Who it is made out to; the guest from their profile when left out. */
  buyer: billingPartySchema.nullable().default(null),
  note: noteField.default(null),
});
export type IssueInvoiceBody = z.infer<typeof issueInvoiceBodySchema>;

/** `POST /api/invoices/:id/void`: optionally issuing a new document in its place. */
export const voidInvoiceBodySchema = z.object({
  reason: z.string().trim().min(1, 'Say why').max(200),
  reissue: z.boolean().default(false),
  /** Who the new document is made out to; the voided one's buyer when left out. */
  buyer: billingPartySchema.nullable().default(null),
});
export type VoidInvoiceBody = z.infer<typeof voidInvoiceBodySchema>;

/** `POST /api/invoices/:id/email`: the document as a PDF, attached to a new email. */
export const emailInvoiceBodySchema = z.object({
  /** The buyer's email when left out. */
  to: z.email().nullable().default(null),
  subject: z.string().trim().min(1).max(300).nullable().default(null),
  body: z.string().trim().min(1).max(5000),
});
export type EmailInvoiceBody = z.infer<typeof emailInvoiceBodySchema>;

export const invoiceFilterSchema = z.object({
  bookingId: z.string().optional(),
  kind: invoiceKindSchema.optional(),
  status: invoiceStatusSchema.optional(),
});
export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>;
