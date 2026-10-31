import type { RoomBlock, StayOption } from '@orbit/shared';

// "$1,250", "$1,250.00", "1,250 USD", "12 500 CZK", "12,500 Kč", "CZK 12.500", "12500,- Kč".
// Thousands may be separated by a space, dot, comma, no-break space (U+00A0) or narrow no-break
// space (U+202F). Prices are whole units, so zero cents are read as none.
const AMOUNT = String.raw`\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+|\d+`;
const CENTS = String.raw`(?:[.,]00)?`;
const CURRENCY = String.raw`USD|US\$|\$|CZK|Kč|Kc|EUR|€`;
// Amount and currency must be on the same line: a numbered list after "… 6 600 CZK" must not
// read as "CZK 2".
const GAP = String.raw`[ \t\u00a0\u202f]*`;
const AFTER = new RegExp(String.raw`(${AMOUNT})${CENTS}(?:,-)?${GAP}(?:${CURRENCY})`, 'gi');
const BEFORE = new RegExp(String.raw`(?:${CURRENCY})${GAP}(${AMOUNT})${CENTS}`, 'gi');

/** Every money amount written in the text, as integers. */
export function amountsInText(text: string): number[] {
  const found: number[] = [];
  for (const re of [AFTER, BEFORE]) {
    for (const m of text.matchAll(re)) {
      if (m[1]) found.push(Number(m[1].replace(/\D/g, '')));
    }
  }
  return found;
}

export interface PriceCheck {
  ok: boolean;
  /** Amounts in the draft that no quote produced. */
  unexpected: number[];
  /** Option totals the draft does not state. */
  missing: number[];
}

/**
 * The model drafts the wording; prices come only from `quote()`. A draft passes if every amount
 * it states is a quoted total or line amount (or in `alsoAllowed`, e.g. a fee the hotel profile
 * states), and every option's total appears. For a block of rooms, the block's total must appear,
 * and each room's quote and each room type's subtotal may.
 */
export function checkDraftPrices(
  draft: string,
  options: StayOption[],
  alsoAllowed: number[] = [],
  block: RoomBlock | null = null,
): PriceCheck {
  const quoted = [...options, ...(block?.rooms ?? [])];
  const allowed = new Set([
    ...alsoAllowed,
    ...quoted.flatMap((o) => [
      o.quote.total,
      ...o.quote.lines.map((l) => Math.abs(l.amount)),
      ...o.quote.lines.map((l) => Math.abs(l.unitPrice)),
    ]),
    ...(block ? [block.total, ...block.byType.map((t) => t.total)] : []),
  ]);
  const found = amountsInText(draft);
  const unexpected = [...new Set(found.filter((a) => !allowed.has(a)))];
  const required = [...options.map((o) => o.quote.total), ...(block ? [block.total] : [])];
  const missing = required.filter((t) => !found.includes(t));
  return { ok: unexpected.length === 0 && missing.length === 0, unexpected, missing };
}
