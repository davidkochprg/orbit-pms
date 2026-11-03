/** What a supplier prints on a bill, for a demo PDF that looks like one. */
export interface BillPdf {
  supplier: { name: string; address: string[]; taxId: string | null; email: string | null };
  billTo: { name: string; address: string[] };
  title: string;
  number: string;
  issuedOn: string;
  dueOn: string | null;
  lines: { label: string; amount: number }[];
  /** Tax on top of the lines, if any. */
  tax: { label: string; amount: number } | null;
  currency: string;
  payTo: string | null;
  reference: string | null;
  /** Labels in the bill's language. */
  words: {
    billTo: string;
    number: string;
    issued: string;
    due: string;
    description: string;
    amount: string;
    subtotal: string;
    total: string;
    payTo: string;
    reference: string;
    taxId: string;
    thanks: string;
  };
}

// Helvetica's advance widths per 1000 units, for right-aligning text without embedding a font.
const upper = [
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611,
];
const lower = [
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500,
];
const narrow = new Set([' ', '.', ',', ':', '/', '(', ')', "'"]);

function charWidth(c: string): number {
  if (c >= 'A' && c <= 'Z') return upper[c.charCodeAt(0) - 65]!;
  if (c >= 'a' && c <= 'z') return lower[c.charCodeAt(0) - 97]!;
  if (narrow.has(c)) return c === '(' || c === ')' ? 333 : 278;
  return c === '-' ? 333 : 556;
}

/** Plain ASCII: Helvetica's standard encoding has no "č", so accents are dropped. */
function ascii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

function textWidth(s: string, size: number): number {
  return ([...s].reduce((w, c) => w + charWidth(c), 0) * size) / 1000;
}

function money(amount: number, currency: string): string {
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(amount);
  return currency === 'USD' ? `$${n}` : `${n} ${currency}`;
}

/** A one-page A4 bill: the supplier's letterhead, who it is for, the lines and the total. */
export function billPdf(bill: BillPdf): Uint8Array {
  const ops: string[] = [];
  const left = 56;
  const right = 539;
  const text = (s: string, x: number, y: number, size = 10, bold = false, grey = false) => {
    const safe = ascii(s).replace(/[\\()]/g, (c) => `\\${c}`);
    ops.push(
      `${grey ? '0.42 g' : '0.1 g'} BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${y} Td (${safe}) Tj ET`,
    );
  };
  const end = (s: string, y: number, size = 10, bold = false, grey = false) =>
    text(s, right - textWidth(ascii(s), size) * (bold ? 1.04 : 1), y, size, bold, grey);
  const rule = (y: number, weight = 0.5) =>
    ops.push(`0.8 G ${weight} w ${left} ${y} m ${right} ${y} l S`);
  const { words } = bill;

  // Letterhead.
  text(bill.supplier.name, left, 778, 16, true);
  let y = 760;
  for (const line of [
    ...bill.supplier.address,
    ...(bill.supplier.email ? [bill.supplier.email] : []),
    ...(bill.supplier.taxId ? [`${words.taxId} ${bill.supplier.taxId}`] : []),
  ]) {
    text(line, left, y, 9, false, true);
    y -= 13;
  }
  end(bill.title.toUpperCase(), 778, 20, true);

  // Who it is for, and the document's numbers.
  const top = 680;
  text(words.billTo, left, top, 8, true, true);
  text(bill.billTo.name, left, top - 16, 10, true);
  bill.billTo.address.forEach((line, i) => text(line, left, top - 30 - i * 13, 9, false, true));
  const facts: [string, string][] = [
    [words.number, bill.number],
    [words.issued, bill.issuedOn],
    ...(bill.dueOn ? ([[words.due, bill.dueOn]] as [string, string][]) : []),
  ];
  facts.forEach(([label, value], i) => {
    text(label, 380, top - i * 16, 9, false, true);
    end(value, top - i * 16, 10);
  });

  // Lines.
  y = 580;
  ops.push(`0.96 g ${left} ${y - 7} ${right - left} 22 re f`);
  text(words.description, left + 8, y, 8, true, true);
  end(words.amount, y, 8, true, true);
  y -= 26;
  for (const line of bill.lines) {
    text(line.label, left + 8, y, 10);
    end(money(line.amount, bill.currency), y, 10);
    y -= 8;
    rule(y);
    y -= 16;
  }

  // Totals.
  y -= 6;
  const subtotal = bill.lines.reduce((s, l) => s + l.amount, 0);
  if (bill.tax) {
    text(words.subtotal, 380, y, 9, false, true);
    end(money(subtotal, bill.currency), y, 10);
    y -= 16;
    text(bill.tax.label, 380, y, 9, false, true);
    end(money(bill.tax.amount, bill.currency), y, 10);
    y -= 20;
  }
  ops.push(`0.1 G 1 w 380 ${y + 14} m ${right} ${y + 14} l S`);
  text(words.total, 380, y, 11, true);
  end(money(subtotal + (bill.tax?.amount ?? 0), bill.currency), y, 12, true);

  // How to pay.
  y = 150;
  rule(y + 18);
  if (bill.payTo) {
    text(words.payTo, left, y, 8, true, true);
    text(bill.payTo, left, y - 14, 10);
  }
  if (bill.reference) {
    text(words.reference, 300, y, 8, true, true);
    text(bill.reference, 300, y - 14, 10);
  }
  text(words.thanks, left, 72, 9, false, true);

  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
