import { z } from 'zod';
import { paymentMethodSchema } from './billing';
import { isoDateSchema } from './dates';
import { attachmentSchema } from './mail';
import { currencySchema, moneySchema } from './quote';

/**
 * A bill from a supplier or contractor: `to_review` when Orbit read it and staff haven't checked
 * it yet, `unpaid` once checked, `paid` once paid.
 */
export const supplierInvoiceStatuses = ['to_review', 'unpaid', 'paid'] as const;
export const supplierInvoiceStatusSchema = z.enum(supplierInvoiceStatuses);
export type SupplierInvoiceStatus = z.infer<typeof supplierInvoiceStatusSchema>;

export const supplierInvoiceStatusLabels: Record<SupplierInvoiceStatus, string> = {
  to_review: 'To check',
  unpaid: 'To pay',
  paid: 'Paid',
};

/** Where a bill came from: a file at the desk, a phone's photo, an email, or typed in. */
export const supplierInvoiceSources = ['upload', 'phone', 'email', 'manual'] as const;
export const supplierInvoiceSourceSchema = z.enum(supplierInvoiceSources);
export type SupplierInvoiceSource = z.infer<typeof supplierInvoiceSourceSchema>;

/**
 * What the model reads off a supplier's invoice, from a photo or a PDF's text. Deliberately loose:
 * the domain checks every field before staff see it.
 */
export const supplierInvoiceReadingSchema = z.object({
  readable: z
    .boolean()
    .describe(
      'False when this is not an invoice or bill, or it is too blurred or cut off to read.',
    ),
  supplierName: z.string().nullable().describe('The business that issued it, as printed.'),
  supplierTaxId: z.string().nullable().describe("The supplier's VAT or tax ID, as printed."),
  supplierEmail: z.string().nullable().describe("The supplier's email address, if printed."),
  number: z.string().nullable().describe('The invoice number, as printed.'),
  issuedOn: z.string().nullable().describe('The issue date, YYYY-MM-DD.'),
  dueOn: z.string().nullable().describe('The date payment is due, YYYY-MM-DD.'),
  currency: z.string().nullable().describe('ISO 4217 code of the amounts, e.g. "USD".'),
  total: z
    .number()
    .nullable()
    .describe('The total to pay, including tax, as printed, e.g. 1284.5.'),
  tax: z.number().nullable().describe('The tax included in the total, if printed.'),
  lines: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number().nullable().describe("The line's amount as printed."),
      }),
    )
    .describe('What was supplied, one item per printed line, at most 20.'),
  bankAccount: z.string().nullable().describe('The account to pay into, as printed.'),
  paymentReference: z
    .string()
    .nullable()
    .describe('A reference to quote with the payment, e.g. a variable symbol.'),
});
export type SupplierInvoiceReading = z.infer<typeof supplierInvoiceReadingSchema>;

export const supplierInvoiceLineSchema = z.object({
  label: z.string(),
  /** Whole units, rounded from what was printed; null when no amount was printed. */
  amount: moneySchema.nullable(),
});
export type SupplierInvoiceLine = z.infer<typeof supplierInvoiceLineSchema>;

/** A supplier's bill to pay. Amounts are whole units of the hotel's currency, rounded. */
export const supplierInvoiceSchema = z.object({
  id: z.string(),
  status: supplierInvoiceStatusSchema,
  /** The contact it is from, when one matches. */
  contactId: z.string().nullable(),
  supplierName: z.string(),
  supplierTaxId: z.string().nullable(),
  number: z.string().nullable(),
  issuedOn: isoDateSchema.nullable(),
  dueOn: isoDateSchema.nullable(),
  currency: currencySchema,
  total: moneySchema,
  tax: moneySchema.nullable(),
  lines: z.array(supplierInvoiceLineSchema),
  bankAccount: z.string().nullable(),
  paymentReference: z.string().nullable(),
  /** The repair it bills for, when there is one. */
  taskId: z.string().nullable(),
  note: z.string().nullable(),
  /** The document it was read from, kept with the mailbox's files. */
  file: attachmentSchema.nullable(),
  source: supplierInvoiceSourceSchema,
  /** The email it came with. */
  inquiryId: z.string().nullable(),
  /** What staff should check, from the reading; cleared once checked. */
  warnings: z.array(z.string()),
  paidOn: isoDateSchema.nullable(),
  paidMethod: paymentMethodSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type SupplierInvoice = z.infer<typeof supplierInvoiceSchema>;

/** A bill with what the list shows: who it is from and whether it is late. */
export const supplierInvoiceViewSchema = supplierInvoiceSchema.extend({
  contactName: z.string().nullable(),
  /** "Bathroom tap is dripping · Room 203" for the repair it bills. */
  repairLabel: z.string().nullable(),
  overdue: z.boolean(),
});
export type SupplierInvoiceView = z.infer<typeof supplierInvoiceViewSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === '' ? null : s));

const amount = moneySchema.min(0).max(100_000_000);

/** `POST /api/supplier-invoices`: a bill typed in, or what staff checked of one read. */
export const supplierInvoiceBodySchema = z.object({
  contactId: z.string().nullable().default(null),
  supplierName: z.string().trim().min(1, 'Add who it is from').max(120),
  supplierTaxId: optionalText(40).default(null),
  number: optionalText(60).default(null),
  issuedOn: isoDateSchema.nullable().default(null),
  dueOn: isoDateSchema.nullable().default(null),
  total: amount.describe("The total to pay in whole units of the hotel's currency."),
  tax: amount.nullable().default(null),
  bankAccount: optionalText(120).default(null),
  paymentReference: optionalText(60).default(null),
  taskId: z.string().nullable().default(null).describe('The repair it bills for, if any.'),
  note: optionalText(500).default(null),
});
export type SupplierInvoiceBody = z.infer<typeof supplierInvoiceBodySchema>;

/**
 * `PATCH /api/supplier-invoices/:id`: fields to correct. `checked` marks a bill Orbit read as
 * checked, so it moves to the bills to pay.
 */
export const supplierInvoicePatchSchema = z
  .object({
    ...supplierInvoiceBodySchema.shape,
    contactId: z.string().nullable(),
    supplierTaxId: optionalText(40),
    number: optionalText(60),
    issuedOn: isoDateSchema.nullable(),
    dueOn: isoDateSchema.nullable(),
    tax: amount.nullable(),
    bankAccount: optionalText(120),
    paymentReference: optionalText(60),
    taskId: z.string().nullable(),
    note: optionalText(500),
    checked: z.literal(true),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Nothing to change');
export type SupplierInvoicePatch = z.infer<typeof supplierInvoicePatchSchema>;

/** `POST /api/supplier-invoices/:id/pay`. */
export const paySupplierInvoiceBodySchema = z.object({
  method: paymentMethodSchema,
  /** Today when left out. */
  paidOn: isoDateSchema.nullable().default(null),
});
export type PaySupplierInvoiceBody = z.infer<typeof paySupplierInvoiceBodySchema>;

/** `POST /api/supplier-invoices/from-attachment`: a file on an email, read as a bill. */
export const supplierInvoiceFromAttachmentSchema = z.object({
  attachmentId: z.string(),
  inquiryId: z.string().nullable().default(null),
});
export type SupplierInvoiceFromAttachment = z.infer<typeof supplierInvoiceFromAttachmentSchema>;

export const supplierInvoiceFilterSchema = z.object({
  status: supplierInvoiceStatusSchema.optional(),
});

/** A short-lived link for photographing a bill with a phone; the ID is the secret in the link. */
export const invoiceScanStatuses = ['waiting', 'reading', 'done', 'failed'] as const;
export const invoiceScanStatusSchema = z.enum(invoiceScanStatuses);
export type InvoiceScanStatus = z.infer<typeof invoiceScanStatusSchema>;

export const invoiceScanSchema = z.object({
  id: z.string(),
  status: invoiceScanStatusSchema,
  /** The bill the photo became. */
  supplierInvoiceId: z.string().nullable(),
  error: z.string().nullable(),
  readingSince: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type InvoiceScan = z.infer<typeof invoiceScanSchema>;

/** What the phone shows: whether the photo arrived, nothing read from it. */
export const invoiceScanPhoneViewSchema = invoiceScanSchema.pick({
  status: true,
  error: true,
  expiresAt: true,
});
export type InvoiceScanPhoneView = z.infer<typeof invoiceScanPhoneViewSchema>;
