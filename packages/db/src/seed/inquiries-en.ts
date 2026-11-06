import type { InquiryFixture } from '@orbit/ai/evals';
import type { IsoDate } from '@orbit/shared';

/** "2026-05-03" as "May 3", the way a US guest writes it. */
function day(date: IsoDate | null): string {
  if (!date) return '';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

type Rewrite = Pick<InquiryFixture, 'subject' | 'senderName' | 'senderAddress' | 'rawText'> & {
  guestName: string;
};

/**
 * English versions of the eval messages that are not in English, for the US demo inbox. Same
 * ids, channels, dates, party sizes and wishes, so every seeded flow still works; only the
 * wording, names and language change. The eval suite keeps the multilingual originals.
 */
const rewrites: Record<string, (f: InquiryFixture) => Rewrite> = {
  inq_01: (f) => ({
    subject: 'Room available?',
    senderName: 'Jane Tester',
    senderAddress: 'jane.tester@example.com',
    guestName: 'Jane Tester',
    rawText: `Hello,\nwe'd like to book a room for 2 people from ${day(f.expected.checkIn)} to ${day(f.expected.checkOut)}. Do you still have availability? We'd also love to use the spa.\n\nThank you and have a nice day,\nJane Tester`,
  }),
  inq_02: (f) => ({
    subject: 'Vacation apartment inquiry',
    senderName: 'The Example Family',
    senderAddress: 'example.family@example.com',
    guestName: 'The Example Family',
    rawText: `Good afternoon,\nwe're a family with two kids (4 and 8 years old) looking for an apartment from ${day(f.expected.checkIn)} to ${day(f.expected.checkOut)}. Is anything available, and what would it cost?\n\nBest wishes,\nThe Example Family`,
  }),
  inq_04: (f) => ({
    subject: 'Reservation',
    senderName: 'Anna Sample',
    senderAddress: 'anna.sample@example.com',
    guestName: 'Anna Sample',
    rawText: `Hello,\nwe'd like to book a room for two adults and a baby (1 year old) from ${day(f.expected.checkIn)} to ${day(f.expected.checkOut)}. We're also interested in the spa. Could you add a crib for the baby?\n\nWarm regards,\nAnna Sample`,
  }),
  inq_05: (f) => ({
    subject: 'Apartment for a week',
    senderName: 'Pete Demo',
    senderAddress: 'pete.demo@example.com',
    guestName: 'Pete Demo',
    rawText: `Hi,\nwe're looking for an apartment for a week, ${day(f.expected.checkIn)} to ${day(f.expected.checkOut)}, for 2 adults and 2 kids (3 and 6). We travel with our dog, is that possible?\n\nThanks,\nPete Demo\n(555) 010-0005`,
  }),
  inq_06: (f) => ({
    subject: 'Single room',
    senderName: 'M. Mustard',
    senderAddress: 'm.mustard@example.com',
    guestName: 'M. Mustard',
    rawText: `Hi,\nI'm in the area for work and need a single room, arriving ${day(f.expected.checkIn)} and leaving ${day(f.expected.checkOut)}.\n\nThanks,\nM. Mustard`,
  }),
  inq_08: (f) => ({
    subject: 'Phone call',
    senderName: 'Tom Trial',
    senderAddress: 'tom.trial@example.com',
    guestName: 'Tom Trial',
    rawText: `Phone call notes:\nTom Trial, 2 adults + son (10) + dog. Arriving ${day(f.expected.checkIn)}, leaving ${day(f.expected.checkOut)}. Asks for confirmation by email: tom.trial@example.com`,
  }),
  inq_09: (f) => ({
    subject: 'Spa weekend',
    senderName: 'Lucy Model',
    senderAddress: 'lucy.model@example.com',
    guestName: 'Lucy Model',
    rawText: `Hi,\nwe'd love to come on ${day(f.expected.checkIn)} for 3 nights, two of us. Can we book the sauna and a massage?\n\nThanks,\nLucy Model`,
  }),
  inq_10: (f) => ({
    subject: f.subject,
    senderName: 'The Testman Family',
    senderAddress: null,
    guestName: 'The Testman Family',
    rawText: `Good evening,\nwe'd like a week's vacation: ${day(f.expected.checkIn)} to ${day(f.expected.checkOut)}, two adults and two kids (12 and 14). Do you have a family room?\n\nKind regards,\nThe Testman Family`,
  }),
  inq_11: (f) => ({
    subject: f.subject,
    senderName: 'Jonah Example',
    senderAddress: null,
    guestName: 'Jonah',
    rawText: `Hi, unfortunately we won't get in until around 10 PM because we're working late. Is a late check-in possible? Is there a key lockbox?\n\nJonah`,
  }),
  inq_13: (f) => ({
    subject: f.subject,
    senderName: 'Kate Trial',
    senderAddress: null,
    guestName: 'Kate',
    rawText: `Hello, do you have a room for 2 from ${day(f.expected.checkIn)} to ${day(f.expected.checkOut)}? I can't see any availability on the site.\n\nKate`,
  }),
  inq_14: (f) => ({
    subject: f.subject,
    senderName: 'Martina Test',
    senderAddress: null,
    guestName: 'Martina',
    rawText: `Hi, can we bring our dog? She's small (a dachshund) and used to hotels. Thanks, Martina`,
  }),
  inq_15: (f) => ({
    subject: 'Team offsite, 6 rooms',
    senderName: 'Petra Example',
    senderAddress: 'petra.example@example.com',
    guestName: 'Petra Example',
    rawText: `Hello,\n\nwe're planning a team offsite for ten colleagues and would need six rooms, four of them for two people each. We'd arrive on ${day(f.expected.checkIn)} and leave on ${day(f.expected.checkOut)}.\n\nDo you offer a group rate?\n\nBest regards,\nPetra Example`,
  }),
};

/** The fixtures with every non-English message replaced by its English version. */
export function inEnglish(fixtures: InquiryFixture[]): InquiryFixture[] {
  return fixtures.map((f) => {
    const rewrite = rewrites[f.id];
    if (!rewrite || f.expected.language === 'en') return f;
    const { guestName, ...fields } = rewrite(f);
    return { ...f, ...fields, expected: { ...f.expected, language: 'en', guestName } };
  });
}
