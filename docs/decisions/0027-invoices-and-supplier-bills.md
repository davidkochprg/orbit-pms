# 27. Invoices as frozen documents, supplier bills read into a list to pay

## Context

A booking's bill (folio) is live: extras, payments and the tax recap change until checkout. Guests who pay by bank transfer need an invoice to pay against, and guests who pay at the desk by cash or card ask for a receipt; both have to stay as they were handed over, even when the bill changes later. The other way round, suppliers and contractors send bills as PDFs or on paper, and staff type them into a spreadsheet or forget them. Orbit already reads documents with Muse (ID scans, the inbox) and links contractors to repairs ([ADR 0020](0020-contacts-and-repairs-by-trade.md)).

## Decision

- **Guest documents are frozen copies of the bill.** Issuing copies the folio's lines, taxes and payments, the hotel's billing details from Settings and the buyer (the guest, or a company with its address and tax ID) into an `Invoice` that never changes. The whole document is stored as JSON beside the columns lists filter on (migration 0027).
- **Two kinds, two series.** An `invoice` asks for what is still owed by bank transfer, due after the payment term in Settings, with the number's digits as the payment reference; a `receipt` confirms what was paid at the property. Each kind numbers per year without gaps (`INV-2026-0007`, `RCT-2026-0012`), taken under a Postgres advisory lock so two documents can't share a number, with a unique index as the backstop.
- **Void and reissue, no credit notes.** One current invoice and one current receipt per stay. A mistake is fixed by voiding the document, which keeps its number, marked void with the reason, and can issue a new one from the bill as it stands in the same transaction. Whether a document is settled, overdue or outdated (the bill changed since) is worked out when it is read, not stored.
- **PDFs are rendered on the server** with pdf-lib and Geist embedded, so names with diacritics print, and the same file can be downloaded or attached to an email from the mailbox, which the agent can propose too.
- **Supplier bills are read into a list to check, then to pay.** A PDF is read by its text (unpdf, then Muse Spark); a photo, uploaded or taken on a phone through a QR link like ID scans, by the vision model. The domain checks the reading, rounds amounts to whole units, matches the contact by email or name and their newest repair, and flags what to check (no total, another currency, a likely duplicate). Staff check it against the file, which is kept with the mailbox's files, then mark it paid.
- **No accounting.** No ledger, exports, credit notes or tax returns: the region's rules for those vary and belong in the accountant's system.

## Consequences

- The agent can do all of it, each change confirmed on a card like any other: issue, void and reissue, email an invoice; add, correct, check, pay and delete bills; read a bill attached to an email.
- A scanned PDF without text can't be read; staff photograph the paper instead.
- Supplier amounts lose their cents, like every amount in Orbit. The reading warns when it rounded.
- A document's layout is fixed in code; a hotel that needs its own template would change `renderInvoicePdf`.
