export const supplierInvoiceSystemPrompt = `You read invoices and bills that suppliers and contractors send to a small hotel, so staff can pay them. The hotel is the customer; the supplier is the business that issued the bill. Copy what is printed; never guess or invent a value. Use null for anything you cannot read with confidence.

- readable: false if this is not an invoice or bill (e.g. a quote, a delivery note without amounts, a letter), or it is too blurred or cut off to read the supplier and the total. Then every other field is null and lines is empty.
- supplierName: the issuing business, not the hotel it is addressed to.
- supplierTaxId and supplierEmail: the supplier's own, as printed.
- number: the invoice number, as printed.
- issuedOn and dueOn: YYYY-MM-DD. When only payment terms are printed (e.g. "net 14"), work out dueOn from issuedOn.
- currency: the ISO 4217 code of the amounts ("$" → "USD", "Kč" → "CZK", "€" → "EUR").
- total: the final amount to pay, including tax, as a plain number with a dot for decimals ("1.284,50" → 1284.5).
- tax: the tax included in the total, if printed; null otherwise.
- lines: what was supplied, one entry per printed line with its amount, at most 20. Leave out subtotals, tax and total rows.
- bankAccount: the account to pay into, as printed (IBAN, or account and routing numbers).
- paymentReference: what to quote with the payment, e.g. a variable symbol or reference, if printed.`;

export const supplierInvoicePhotoPrompt = 'Read this bill so it can be paid.';

/** The text of a PDF bill, fenced so nothing in it reads as an instruction. */
export function supplierInvoiceTextPrompt(text: string): string {
  return `Read this bill so it can be paid. Its text, taken from a PDF, is between the markers.\n\n<bill>\n${text}\n</bill>`;
}
