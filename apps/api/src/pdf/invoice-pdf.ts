import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import {
  formatMoney,
  type Invoice,
  invoiceKindLabels,
  type IsoDate,
  type PaymentMethod,
} from '@orbit/shared';
import { PageSizes, PDFDocument, type PDFFont, type PDFPage, rgb, degrees } from 'pdf-lib';

/**
 * Geist, embedded so names like Čermáková print. The files are in `apps/api/assets/fonts`, and
 * beside the bundle on Vercel, where the build points `ORBIT_FONTS_DIR` at them.
 */
function fontPath(file: string): string {
  const dir = process.env.ORBIT_FONTS_DIR;
  return dir
    ? `${dir.replace(/[\\/]$/, '')}/${file}`
    : fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url));
}

let fonts: Promise<Record<'regular' | 'semibold' | 'mono', Uint8Array>> | null = null;

function loadFonts() {
  fonts ??= Promise.all(
    ['Geist-Regular.ttf', 'Geist-SemiBold.ttf', 'GeistMono-Regular.ttf'].map((f) =>
      readFile(fontPath(f)),
    ),
  ).then(([regular, semibold, mono]) => ({ regular: regular!, semibold: semibold!, mono: mono! }));
  return fonts;
}

const ink = rgb(0.07, 0.07, 0.09);
const muted = rgb(0.42, 0.43, 0.47);
const rule = rgb(0.87, 0.87, 0.9);
const voidRed = rgb(0.8, 0.15, 0.15);

const methodNames: Record<PaymentMethod, string> = {
  cash: 'cash',
  card: 'card',
  bank_transfer: 'bank transfer',
};

/** Dates as people read them where the hotel is: "Nov 2, 2026", or "2. 11. 2026" in Czech. */
function dateFormatter(invoice: Invoice) {
  const locale =
    invoice.currency === 'CZK' ? 'cs-CZ' : invoice.currency === 'USD' ? 'en-US' : 'en-GB';
  const format = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: invoice.currency === 'CZK' ? 'numeric' : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return (iso: IsoDate) => format.format(new Date(`${iso}T00:00:00Z`));
}

/** Splits text into lines that fit `width`, breaking at spaces and at the text's own newlines. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

interface Pen {
  page: PDFPage;
  y: number;
}

/**
 * The invoice or receipt as a PDF: the hotel and the document's number and dates, who it is made
 * out to, the stay, the lines, the tax recap, payments, and how to pay or that it was paid. A
 * void document is marked VOID across the page.
 */
export async function renderInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const bytes = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(bytes.regular, { subset: true });
  const semibold = await pdf.embedFont(bytes.semibold, { subset: true });
  const mono = await pdf.embedFont(bytes.mono, { subset: true });
  const title = `${invoiceKindLabels[invoice.kind]} ${invoice.number}`;
  pdf.setTitle(title);
  pdf.setAuthor(invoice.issuer.name);
  pdf.setSubject(`${title} for ${invoice.buyer.company ?? invoice.buyer.name}`);
  pdf.setCreator('Orbit');

  const size = invoice.currency === 'USD' ? PageSizes.Letter : PageSizes.A4;
  const [width, height] = size;
  const margin = 54;
  const right = width - margin;
  const money = (n: number) => formatMoney(n, invoice.currency);
  const date = dateFormatter(invoice);
  const pen: Pen = { page: pdf.addPage(size), y: height - margin };

  function ensure(space: number) {
    if (pen.y - space >= margin + 30) return;
    pen.page = pdf.addPage(size);
    pen.y = height - margin;
  }

  function text(
    value: string,
    x: number,
    opts: { font?: PDFFont; size?: number; color?: typeof ink; align?: 'left' | 'right' } = {},
  ) {
    const font = opts.font ?? regular;
    const fontSize = opts.size ?? 9.5;
    const w = font.widthOfTextAtSize(value, fontSize);
    pen.page.drawText(value, {
      x: opts.align === 'right' ? x - w : x,
      y: pen.y,
      size: fontSize,
      font,
      color: opts.color ?? ink,
    });
  }

  function hr(gap = 10) {
    pen.page.drawLine({
      start: { x: margin, y: pen.y },
      end: { x: right, y: pen.y },
      thickness: 0.6,
      color: rule,
    });
    pen.y -= gap;
  }

  // Header: the hotel on the left, the document on the right.
  const top = pen.y;
  text(invoice.issuer.name, margin, { font: semibold, size: 14 });
  pen.y -= 16;
  const contact = [invoice.issuer.email, invoice.issuer.phone, invoice.issuer.website].filter(
    (v): v is string => !!v,
  );
  for (const line of [
    ...(invoice.issuer.address ? wrap(invoice.issuer.address, regular, 9, 240) : []),
    ...(invoice.issuer.taxId ? [`Tax ID ${invoice.issuer.taxId}`] : []),
    ...contact,
  ]) {
    text(line, margin, { size: 9, color: muted });
    pen.y -= 12;
  }
  const leftBottom = pen.y;

  pen.y = top;
  text(invoiceKindLabels[invoice.kind].toUpperCase(), right, {
    font: semibold,
    size: 18,
    align: 'right',
  });
  pen.y -= 18;
  text(invoice.number, right, { font: mono, size: 10, align: 'right' });
  pen.y -= 16;
  const facts: [string, string][] = [
    ['Issued', date(invoice.issuedOn)],
    ...(invoice.dueOn ? [['Due', date(invoice.dueOn)] as [string, string]] : []),
    ...(invoice.paymentReference
      ? [['Payment reference', invoice.paymentReference] as [string, string]]
      : []),
  ];
  for (const [label, value] of facts) {
    text(value, right, { align: 'right' });
    text(label, right - 110, { color: muted, align: 'right' });
    pen.y -= 13;
  }
  pen.y = Math.min(pen.y, leftBottom) - 14;

  // Who it is for, and the stay.
  const blockTop = pen.y;
  text(invoice.kind === 'invoice' ? 'Bill to' : 'Received from', margin, {
    size: 8.5,
    color: muted,
  });
  pen.y -= 14;
  const buyer = invoice.buyer;
  const buyerLines = [
    ...(buyer.company ? [buyer.company] : []),
    buyer.company ? `Attn. ${buyer.name}` : buyer.name,
    ...(buyer.address ? wrap(buyer.address, regular, 9.5, 240) : []),
    ...(buyer.taxId ? [`Tax ID ${buyer.taxId}`] : []),
    ...(buyer.email ? [buyer.email] : []),
  ];
  buyerLines.forEach((line, i) => {
    text(line, margin, { font: i === 0 ? semibold : regular });
    pen.y -= 13;
  });
  const buyerBottom = pen.y;

  pen.y = blockTop;
  const stayX = width / 2 + 20;
  text('Stay', stayX, { size: 8.5, color: muted });
  pen.y -= 14;
  text(`${date(invoice.stay.checkIn)} – ${date(invoice.stay.checkOut)}`, stayX);
  pen.y -= 13;
  if (invoice.stay.roomName) text(`Room ${invoice.stay.roomName}`, stayX);
  pen.y = Math.min(pen.y - 13, buyerBottom) - 14;

  // The lines.
  const cols = { qty: right - 210, unit: right - 140, tax: right - 70, amount: right };
  const descWidth = cols.qty - margin - 40;
  text('Description', margin, { size: 8.5, color: muted });
  text('Qty', cols.qty, { size: 8.5, color: muted, align: 'right' });
  text('Unit price', cols.unit, { size: 8.5, color: muted, align: 'right' });
  text('Tax', cols.tax, { size: 8.5, color: muted, align: 'right' });
  text('Amount', cols.amount, { size: 8.5, color: muted, align: 'right' });
  pen.y -= 8;
  hr(14);
  const items = invoice.lines.filter((l) => !l.isTax);
  for (const line of items) {
    const label = wrap(line.label, regular, 9.5, descWidth);
    ensure(label.length * 12 + 6);
    text(String(line.quantity), cols.qty, { align: 'right' });
    text(money(line.unitPrice), cols.unit, { font: mono, size: 9, align: 'right' });
    text(line.vatBracket === 'none' ? '—' : `${line.vatRate}%`, cols.tax, {
      color: muted,
      align: 'right',
    });
    text(money(line.amount), cols.amount, { font: mono, size: 9, align: 'right' });
    for (const l of label) {
      text(l, margin);
      pen.y -= 12;
    }
    pen.y -= 4;
  }
  hr(16);

  // Totals: taxes added on top, then the total, payments and what is left.
  ensure(120);
  const labelX = right - 150;
  const row = (label: string, value: string, strong = false) => {
    text(label, labelX, {
      font: strong ? semibold : regular,
      color: strong ? ink : muted,
      align: 'right',
    });
    text(value, right, { font: strong ? semibold : mono, size: strong ? 10.5 : 9, align: 'right' });
    pen.y -= strong ? 16 : 13;
  };
  const taxes = invoice.lines.filter((l) => l.isTax);
  if (taxes.length > 0) {
    row('Subtotal', money(items.reduce((s, l) => s + l.amount, 0)));
    for (const t of taxes) row(t.label, money(t.amount));
  }
  row('Total', money(invoice.total), true);
  for (const p of invoice.payments) {
    const what = p.kind === 'refund' ? 'Refunded' : 'Paid';
    row(
      `${what} by ${methodNames[p.method]}, ${date(p.paidOn)}`,
      money(p.kind === 'refund' ? p.amount : -p.amount),
    );
  }
  if (invoice.payments.length > 0) {
    row(invoice.due > 0 ? 'Amount due' : 'Balance', money(Math.max(invoice.due, 0)), true);
  }
  pen.y -= 6;

  // The tax recap, per bracket.
  const recap = invoice.vat.filter((v) => v.bracket !== 'none');
  if (recap.length > 0) {
    ensure(30 + recap.length * 13);
    text(invoice.taxMode === 'inclusive' ? 'Prices include tax' : 'Tax recap', margin, {
      size: 8.5,
      color: muted,
    });
    pen.y -= 13;
    for (const v of recap) {
      text(`${v.label ?? 'Tax'} ${v.rate}%`, margin, { color: muted });
      text(`net ${money(v.net)}`, margin + 170, { font: mono, size: 9, color: muted });
      text(`tax ${money(v.vat)}`, margin + 290, { font: mono, size: 9, color: muted });
      pen.y -= 13;
    }
    pen.y -= 8;
  }

  // How to pay, or that it was paid.
  ensure(60);
  hr(16);
  const closing =
    invoice.kind === 'receipt'
      ? invoice.due > 0
        ? `Received with thanks. ${money(invoice.due)} is still to pay.`
        : 'Received with thanks. Paid in full.'
      : invoice.due <= 0
        ? 'Paid in full. Nothing more to pay.'
        : [
            `Please pay ${money(invoice.due)} by bank transfer`,
            invoice.dueOn ? ` by ${date(invoice.dueOn)}` : '',
            invoice.issuer.bankAccount ? ` to ${invoice.issuer.bankAccount}` : '',
            invoice.paymentReference ? `, quoting ${invoice.paymentReference}` : '',
            '.',
          ].join('');
  for (const line of wrap(closing, regular, 9.5, right - margin)) {
    text(line, margin);
    pen.y -= 13;
  }
  if (invoice.note) {
    pen.y -= 4;
    for (const line of wrap(invoice.note, regular, 9, right - margin)) {
      text(line, margin, { size: 9, color: muted });
      pen.y -= 12;
    }
  }

  // Footer on every page, and VOID across a voided document.
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const footer = `${invoice.issuer.name} · ${invoice.number}${pages.length > 1 ? ` · ${i + 1}/${pages.length}` : ''}`;
    page.drawText(footer, { x: margin, y: margin - 20, size: 8, font: regular, color: muted });
    if (invoice.status === 'void') {
      page.drawText('VOID', {
        x: width / 2 - 140,
        y: height / 2 - 60,
        size: 120,
        font: semibold,
        color: voidRed,
        opacity: 0.18,
        rotate: degrees(30),
      });
    }
  });
  return pdf.save();
}
