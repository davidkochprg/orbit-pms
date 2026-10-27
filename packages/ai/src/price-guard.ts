import type { StayOption } from '@orbit/shared';

// "12 500 CZK", "12,500 Kč", "CZK 12.500", "12500,- Kč". Thousands may be separated by a space,
// dot, comma, no-break space (U+00A0) or narrow no-break space (U+202F).
const AMOUNT = String.raw`\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+|\d+`;
const CURRENCY = String.raw`CZK|Kč|Kc|EUR|€`;
const AFTER = new RegExp(String.raw`(${AMOUNT})(?:,-)?\s*(?:${CURRENCY})`, 'gi');
const BEFORE = new RegExp(String.raw`(?:${CURRENCY})\s*(${AMOUNT})`, 'gi');

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
 * it states is a quoted total or line amount, and every option's total appears.
 */
export function checkDraftPrices(draft: string, options: StayOption[]): PriceCheck {
  const allowed = new Set(
    options.flatMap((o) => [
      o.quote.total,
      ...o.quote.lines.map((l) => Math.abs(l.amount)),
      ...o.quote.lines.map((l) => Math.abs(l.unitPrice)),
    ]),
  );
  const found = amountsInText(draft);
  const unexpected = [...new Set(found.filter((a) => !allowed.has(a)))];
  const missing = options.map((o) => o.quote.total).filter((t) => !found.includes(t));
  return { ok: unexpected.length === 0 && missing.length === 0, unexpected, missing };
}
