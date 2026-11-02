import type { SupplierInvoiceReading } from '@orbit/shared';

export interface BillFixture {
  id: string;
  /** A bill's text as it comes out of a PDF: lines in reading order, spacing as extracted. */
  text: string;
  /** The fields that must be read exactly; amounts within a cent. */
  expected: Partial<SupplierInvoiceReading> & Pick<SupplierInvoiceReading, 'readable'>;
}

/** Synthetic bills to a fictional hotel, from fictional suppliers on reserved example domains. */
export const billFixtures: BillFixture[] = [
  {
    id: 'plumber-us-net-terms',
    text: `RIDGE TEST PLUMBING INC
44 Example Ave, Bishop CA 93514
billing@ridgetest-plumbing.example
INVOICE
Invoice # RTP-20931 Date: 10/28/2026 Terms: Net 14
Bill to: Orbit Demo Lodge LLC, 100 Example Road, Mammoth Lakes CA
Description Qty Rate Amount
Replace bathroom tap cartridge, room 203 1 240.00 240.00
Call-out fee 1 145.00 145.00
Subtotal 385.00
Sales tax 0.00
Total due USD 385.00
Please pay by ACH to Example Bank, routing 000000000, account 0009876543.`,
    expected: {
      readable: true,
      number: 'RTP-20931',
      issuedOn: '2026-10-28',
      dueOn: '2026-11-11',
      currency: 'USD',
      total: 385,
    },
  },
  {
    id: 'laundry-cz-decimal-comma',
    text: `Prádelna Testovací s.r.o.
Testovací 5, 460 01 Liberec
IČO: 12345678 DIČ: CZ12345678
FAKTURA - DAŇOVÝ DOKLAD č. 2026/1047
Datum vystavení: 31.10.2026 Datum splatnosti: 14.11.2026
Variabilní symbol: 20261047
Odběratel: Orbit Demo Penzion s.r.o.
Praní ložního prádla, říjen 1 061,57
DPH 21 % 222,93
Celkem k úhradě: 1.284,50 Kč
Číslo účtu: 123456789/0800`,
    expected: {
      readable: true,
      number: '2026/1047',
      issuedOn: '2026-10-31',
      dueOn: '2026-11-14',
      currency: 'CZK',
      total: 1284.5,
      tax: 222.93,
      paymentReference: '20261047',
    },
  },
  {
    id: 'bakery-de-eur',
    text: `Bäckerei Beispiel GmbH · Musterweg 3 · 01067 Dresden
USt-IdNr. DE999999999
Rechnung Nr. R-55120
Rechnungsdatum: 02.11.2026
Zahlbar bis: 16.11.2026
An: Orbit Demo Lodge
Brötchen, Oktober 612,00 €
Croissants, Oktober 248,00 €
Nettobetrag 860,00 €
zzgl. 7 % MwSt. 60,20 €
Gesamtbetrag 920,20 €`,
    expected: {
      readable: true,
      supplierName: 'Bäckerei Beispiel GmbH',
      supplierTaxId: 'DE999999999',
      number: 'R-55120',
      issuedOn: '2026-11-02',
      dueOn: '2026-11-16',
      currency: 'EUR',
      total: 920.2,
      tax: 60.2,
    },
  },
  {
    id: 'quote-not-a-bill',
    text: `SUMMIT TEST HEATING
QUOTE Q-7781 Valid for 30 days
Prepared for: Orbit Demo Lodge
Replace boiler circulation pump 1 820.00
Labour 4 h 380.00
Estimated total 1,200.00
This is not an invoice. Reply to accept.`,
    expected: { readable: false },
  },
];

/** What a reading got wrong against the fixture, as short labels; empty when it passed. */
export function scoreBillReading(
  expected: BillFixture['expected'],
  reading: SupplierInvoiceReading,
): string[] {
  const problems: string[] = [];
  for (const [key, want] of Object.entries(expected) as [keyof SupplierInvoiceReading, unknown][]) {
    const got = reading[key];
    const same =
      typeof want === 'number' && typeof got === 'number'
        ? Math.abs(want - got) < 0.01
        : typeof want === 'string' && typeof got === 'string'
          ? want.toLowerCase() === got.toLowerCase()
          : JSON.stringify(want) === JSON.stringify(got);
    if (!same) problems.push(`${key} ${JSON.stringify(got)}`);
  }
  return problems;
}
