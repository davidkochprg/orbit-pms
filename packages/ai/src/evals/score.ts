import type { InquiryExtraction } from '@orbit/shared';

export type ExtractionField = 'kind' | 'language' | 'dates' | 'adults' | 'childAges' | 'wishes';

export interface ExtractionScore {
  passed: boolean;
  failed: ExtractionField[];
}

function sameAges(a: number[], b: number[]): boolean {
  const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y).join(',');
  return sorted(a) === sorted(b);
}

/** Exact match on the fields the booking flow depends on. Guest name and question text are not scored. */
export function scoreExtraction(
  expected: InquiryExtraction,
  actual: InquiryExtraction,
): ExtractionScore {
  const checks: Record<ExtractionField, boolean> = {
    kind: expected.kind === actual.kind,
    language: expected.language === actual.language,
    dates: expected.checkIn === actual.checkIn && expected.checkOut === actual.checkOut,
    adults: expected.adults === actual.adults,
    childAges: sameAges(expected.childAges, actual.childAges),
    wishes:
      expected.wishes.wellness === actual.wishes.wellness &&
      expected.wishes.dog === actual.wishes.dog &&
      expected.wishes.apartment === actual.wishes.apartment,
  };
  const failed = (Object.keys(checks) as ExtractionField[]).filter((field) => !checks[field]);
  return { passed: failed.length === 0, failed };
}
