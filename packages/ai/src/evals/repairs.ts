import { accessDays, addDays } from '@orbit/domain';
import type { RoomAccess, Trade } from '@orbit/shared';
import type { RepairReplyFacts, WorkOrderFacts } from '../prompts/repairs';

export interface TradeFixture {
  id: string;
  issue: string;
  /** Any one of these passes; [] means no trade (null). */
  trades: Trade[];
}

/** Repair notes as staff type them into a task, in the languages the desk works in. */
export const tradeFixtures: TradeFixture[] = [
  { id: 'tr_01', issue: "Shower keeps running, can't turn it off.", trades: ['plumbing'] },
  { id: 'tr_02', issue: 'Toilet is blocked.', trades: ['plumbing'] },
  { id: 'tr_03', issue: 'Radiator stays cold.', trades: ['heating'] },
  { id: 'tr_04', issue: 'Socket by the desk sparks.', trades: ['electrical'] },
  { id: 'tr_05', issue: 'TV shows no signal.', trades: ['internet', 'appliances'] },
  { id: 'tr_06', issue: 'Key card does not open the door.', trades: ['locks'] },
  { id: 'tr_07', issue: 'Wardrobe door came off its hinge.', trades: ['building'] },
  { id: 'tr_08', issue: 'Ants on the balcony.', trades: ['pests'] },
  { id: 'tr_09', issue: 'Mini fridge is not cooling.', trades: ['appliances'] },
  { id: 'tr_10', issue: 'Ve sprše neteče teplá voda.', trades: ['plumbing', 'heating'] },
  { id: 'tr_11', issue: 'Das WLAN im Zimmer geht nicht.', trades: ['internet'] },
  { id: 'tr_12', issue: 'Red wine stain on the carpet.', trades: ['cleaning'] },
  { id: 'tr_13', issue: 'Out of shampoo refills.', trades: ['supplies'] },
];

export interface WorkOrderFixture {
  id: string;
  facts: WorkOrderFacts;
  /** Words one of which the email must contain, per check, case-insensitive. */
  mustMention: string[][];
  /** Words the email must not contain, e.g. the guest's name. */
  mustNotMention: string[];
}

/** Contractor emails for a synthetic lodge, dated relative to `today`. */
export function buildWorkOrderFixtures(today: string): WorkOrderFixture[] {
  const hotel = {
    name: 'Example Pines Lodge',
    location: 'Example Valley, CA',
    phone: '(530) 555-0199',
    checkOutBy: '11:00',
    checkInFrom: '15:00',
  };
  return [
    {
      id: 'wo_01',
      facts: {
        hotel,
        signer: 'Jordan',
        contact: { name: 'Ridgeline Plumbing', person: 'Sam', language: 'en' },
        roomName: '203',
        issue: 'Bathroom tap is dripping.',
        access: {
          guestName: 'Avery Sample',
          freeFrom: addDays(today, 2),
          freeUntil: addDays(today, 4),
        },
        today,
      },
      mustMention: [['203'], ['tap', 'faucet'], ['11']],
      mustNotMention: ['Avery', 'Sample'],
    },
    {
      id: 'wo_02',
      facts: {
        hotel,
        signer: null,
        contact: { name: 'Alpine Electric', person: null, language: 'en' },
        roomName: '305',
        issue: 'Ceiling light flickers.',
        access: { guestName: null, freeFrom: today, freeUntil: null },
        today,
      },
      mustMention: [['305'], ['light'], ['today']],
      mustNotMention: ['$'],
    },
    {
      id: 'wo_03',
      facts: {
        hotel: { ...hotel, name: 'Penzion Příklad', location: 'Příkladov' },
        signer: 'Eva',
        contact: { name: 'Instalatérství Pod Horou', person: 'pan Vodička', language: 'cs' },
        roomName: 'A2',
        issue: 'Shower keeps running.',
        access: {
          guestName: 'Kim Example',
          freeFrom: addDays(today, 1),
          freeUntil: addDays(today, 3),
        },
        today,
      },
      mustMention: [['A2'], ['sprch'], ['dobrý den', 'dobry den', 'vážený', 'zdravím']],
      mustNotMention: ['Kim', 'shower'],
    },
  ];
}

/** Problems with a drafted work order: missing facts, the guest named, or no subject. */
export function scoreWorkOrder(
  fixture: WorkOrderFixture,
  draft: { subject: string; body: string },
): string[] {
  const text = `${draft.subject}\n${draft.body}`.toLowerCase();
  const problems: string[] = [];
  if (!draft.subject.trim()) problems.push('no subject');
  if (draft.body.trim().length < 40) problems.push('body too short');
  for (const words of fixture.mustMention) {
    if (!words.some((w) => text.includes(w.toLowerCase()))) problems.push(`no ${words.join('/')}`);
  }
  for (const word of fixture.mustNotMention) {
    if (text.includes(word.toLowerCase())) problems.push(`mentions ${word}`);
  }
  return problems;
}

export interface RepairReplyFixture {
  id: string;
  facts: RepairReplyFacts;
  /** Words one of which the reply must contain, per check, case-insensitive. */
  mustMention: string[][];
  /** Words the reply must not contain, e.g. the guest's name. */
  mustNotMention: string[];
}

const weekday = (date: string, locale = 'en-US') =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });

/**
 * Contractors answering the hotel about a repair: a time that works, a time a guest is still in
 * the room, an answer in Czech, and a price to agree to. Dated relative to `today`.
 */
export function buildRepairReplyFixtures(today: string): RepairReplyFixture[] {
  const hotel = {
    name: 'Example Pines Lodge',
    location: 'Example Valley, CA',
    phone: '(530) 555-0199',
    checkOutBy: '11:00',
    checkInFrom: '15:00',
  };
  const yesterday = addDays(today, -1);
  const facts = (
    access: RoomAccess,
    answer: string,
    overrides: Partial<RepairReplyFacts> = {},
  ): RepairReplyFacts => ({
    hotel,
    signer: 'Jordan',
    contact: { name: 'Alpine Electric', person: 'Dana', language: 'en' },
    roomName: '305',
    issue: 'Ceiling light flickers.',
    access,
    today,
    days: accessDays(access, today),
    messages: [
      {
        from: 'hotel',
        date: yesterday,
        body: 'Hi Dana,\n\nthe ceiling light in room 305 keeps flickering. Could you come and take a look this week?\n\nThanks,\nJordan',
      },
      { from: 'contractor', date: today, body: answer },
    ],
    ...overrides,
  });
  return [
    {
      id: 'rr_01',
      facts: facts(
        { guestName: null, freeFrom: today, freeUntil: addDays(today, 5) },
        'Hi,\n\nsounds like a failing driver. I can come by tomorrow between 9 and 11 am. Does that work for the room?\n\nDana',
      ),
      mustMention: [['9'], ['works', 'fine', 'perfect', 'great', 'suits', 'see you']],
      mustNotMention: ['Subject:'],
    },
    {
      id: 'rr_02',
      facts: facts(
        { guestName: 'Avery Sample', freeFrom: addDays(today, 3), freeUntil: null },
        'Hi,\n\nI could come tomorrow morning at 9. Would that work?\n\nDana',
      ),
      mustMention: [[weekday(addDays(today, 3))], ['11']],
      mustNotMention: ['Avery', 'Sample'],
    },
    {
      id: 'rr_03',
      facts: facts(
        { guestName: 'Kim Example', freeFrom: addDays(today, 1), freeUntil: addDays(today, 4) },
        'Dobrý den,\n\nmůžu přijet pozítří kolem 10. hodiny. Vyhovuje vám to?\n\nElektro Sever',
        {
          hotel: { ...hotel, name: 'Penzion Příklad', location: 'Příkladov' },
          signer: 'Eva',
          contact: { name: 'Elektro Sever', person: null, language: 'cs' },
          roomName: 'A2',
        },
      ),
      mustMention: [['dobrý den', 'dobry den', 'zdravím'], ['10']],
      mustNotMention: ['Kim', 'thanks', 'tomorrow'],
    },
    {
      id: 'rr_04',
      facts: facts(
        { guestName: null, freeFrom: today, freeUntil: null },
        'Hi,\n\nit is the LED driver. The part is $85 plus a $60 call-out. Shall I order it? I can fit it as soon as it arrives.\n\nDana',
      ),
      mustMention: [['confirm', 'check', 'get back', 'manager']],
      mustNotMention: ['go ahead'],
    },
  ];
}

/** Problems with a reply to a contractor: missing facts, the guest named, or too short. */
export function scoreRepairReply(fixture: RepairReplyFixture, reply: string): string[] {
  const text = reply.toLowerCase();
  const problems: string[] = [];
  if (reply.trim().length < 40) problems.push('too short');
  for (const words of fixture.mustMention) {
    if (!words.some((w) => text.includes(w.toLowerCase()))) problems.push(`no ${words.join('/')}`);
  }
  for (const word of fixture.mustNotMention) {
    if (text.includes(word.toLowerCase())) problems.push(`mentions ${word}`);
  }
  return problems;
}
