import type { HousekeepingNoteReading, IdDocumentReading, InquiryExtraction } from '@orbit/shared';
import type { HousekeepingNoteFixture } from './housekeeping-notes';

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

export interface NoteScore {
  passed: boolean;
  problems: string[];
}

/**
 * Scores a housekeeping note reading: the same rooms (one update each), the same status per room,
 * an issue exactly where one was reported, and `unclear` set exactly when expected.
 */
export function scoreHousekeepingNote(
  fixture: Pick<HousekeepingNoteFixture, 'expected' | 'unclear'>,
  actual: HousekeepingNoteReading,
): NoteScore {
  const problems: string[] = [];
  const byRoom = new Map<string, HousekeepingNoteReading['updates']>();
  for (const update of actual.updates) {
    const key = update.room.trim().toUpperCase();
    byRoom.set(key, [...(byRoom.get(key) ?? []), update]);
  }
  for (const want of fixture.expected) {
    const got = byRoom.get(want.room.toUpperCase());
    byRoom.delete(want.room.toUpperCase());
    if (!got) {
      problems.push(`missing ${want.room}`);
      continue;
    }
    // Several updates for one room are read together: the last status and any issue count.
    const status = got.findLast((u) => u.status !== null)?.status ?? null;
    const issue = got.some((u) => Boolean(u.issue?.trim()));
    if (status !== want.status) problems.push(`${want.room} status ${status} != ${want.status}`);
    if (issue !== want.issue) problems.push(`${want.room} issue ${issue} != ${want.issue}`);
  }
  for (const extra of byRoom.keys()) problems.push(`unexpected ${extra}`);
  if (Boolean(actual.unclear?.trim()) !== fixture.unclear) {
    problems.push(fixture.unclear ? 'unclear not reported' : 'unexpected unclear');
  }
  return { passed: problems.length === 0, problems };
}

/** Every expected field must match exactly; names compare case-insensitively. */
export function scoreIdReading(
  expected: Partial<IdDocumentReading>,
  actual: IdDocumentReading,
): { passed: boolean; failed: string[] } {
  const failed = (Object.keys(expected) as (keyof IdDocumentReading)[]).filter((key) => {
    const want = expected[key];
    const got = actual[key];
    if (key === 'fullName' && typeof want === 'string' && typeof got === 'string') {
      return want.toLocaleLowerCase() !== got.trim().toLocaleLowerCase();
    }
    return want !== got;
  });
  return { passed: failed.length === 0, failed };
}
