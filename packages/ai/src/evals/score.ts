import type {
  HousekeepingNoteReading,
  IdDocumentReading,
  InquiryExtraction,
  StayReadings,
} from '@orbit/shared';
import type { HousekeepingNoteFixture } from './housekeeping-notes';
import type { StayNotesFixture } from './stay-notes';

export type ExtractionField =
  'kind' | 'language' | 'dates' | 'adults' | 'rooms' | 'childAges' | 'wishes';

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
    // "A room" and no number of rooms mean the same to the booking flow.
    rooms: (expected.rooms ?? 1) === (actual.rooms ?? 1),
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
 * an issue exactly where one was reported with a trade that fixes it, and `unclear` set exactly
 * when expected.
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
    const trade = got.find((u) => u.issue?.trim())?.trade ?? null;
    if (issue && want.trade && (!trade || !want.trade.includes(trade))) {
      problems.push(`${want.room} trade ${trade} not ${want.trade.join('/')}`);
    }
  }
  for (const extra of byRoom.keys()) problems.push(`unexpected ${extra}`);
  if (Boolean(actual.unclear?.trim()) !== fixture.unclear) {
    problems.push(fixture.unclear ? 'unclear not reported' : 'unexpected unclear');
  }
  return { passed: problems.length === 0, problems };
}

/**
 * Scores what the model read from stays' notes: one reading per stay, pets exactly, the mess
 * within the allowed levels, and each thing to set up found by one of its words, with nothing
 * listed where nothing is expected.
 */
export function scoreStayReadings(fixture: StayNotesFixture, actual: StayReadings): NoteScore {
  const problems: string[] = [];
  for (const want of fixture.stays) {
    const got = actual.stays.filter((s) => s.bookingId === want.bookingId);
    if (got.length !== 1) {
      problems.push(`${want.bookingId} read ${got.length} times`);
      continue;
    }
    const { pets, mess, prepare } = got[0]!;
    if (pets !== want.pets) problems.push(`${want.bookingId} pets ${pets}`);
    if (!want.mess.includes(mess)) problems.push(`${want.bookingId} mess ${mess}`);
    const items = prepare.map((p) => p.toLowerCase());
    if (want.prepare.length === 0 && items.length > 0) {
      problems.push(`${want.bookingId} prepare ${JSON.stringify(prepare)}`);
    }
    for (const words of want.prepare) {
      if (!items.some((item) => words.some((w) => item.includes(w)))) {
        problems.push(`${want.bookingId} prepare misses ${words[0]}`);
      }
    }
  }
  const known = new Set(fixture.stays.map((s) => s.bookingId));
  for (const extra of actual.stays.filter((s) => !known.has(s.bookingId))) {
    problems.push(`unexpected ${extra.bookingId}`);
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
