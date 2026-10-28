import {
  addDays,
  createBillingService,
  createGuestService,
  createHotelService,
  createHousekeepingService,
  createPendingActionService,
  createRegistrationService,
  createReportService,
  hotelPolicy,
  usDemoPricing,
} from '@orbit/domain';
import { createMemoryRepositories } from '@orbit/domain/testing';
import type { Booking, IsoDate, PendingActionInput, RoomType } from '@orbit/shared';
import { createAgentTools } from '../tools';

/** A tool call as the agent made it. */
export interface EvalToolCall {
  toolName: string;
  input: unknown;
}

type EvalHotel = ReturnType<typeof buildAgentEvalHotel>;

export interface AgentFixture {
  id: string;
  /** What a staff member types into the command bar. */
  prompt: string;
  /** Problems with the run; empty when it did what was asked. */
  check: (run: { hotel: EvalHotel; calls: EvalToolCall[]; answer: string }) => string[];
}

const double: RoomType = {
  id: 'rt_double',
  name: 'Double room',
  maxAdults: 2,
  maxChildren: 1,
  basePrice: 1000,
  description: '',
};

const stay: Omit<Booking, 'id' | 'guestId' | 'roomId' | 'checkIn' | 'checkOut' | 'adults'> = {
  childAges: [],
  status: 'confirmed',
  holdExpiresAt: null,
  source: 'email',
  addons: { wellness: false, dogs: 0, extraBeds: 0 },
  priceSnapshot: null,
  notes: null,
};

/**
 * A four-room US inn for agent evals, on the demo's rates, with dates relative to `today`: Anna
 * Example in 104 since yesterday with two extras on her bill and her ID recorded, Jan Dvořák
 * arriving in 201 today without an ID recorded, room 101 dirty and 202 free.
 */
export function buildAgentEvalHotel(today: IsoDate) {
  const now = new Date(`${today}T09:00:00Z`);
  const clock = () => now;
  const repos = createMemoryRepositories(
    {
      roomTypes: [double],
      rooms: ['101', '104', '201', '202'].map((name) => ({
        id: `rm_${name}`,
        name,
        roomTypeId: double.id,
        kind: 'room' as const,
        floor: Number(name[0]),
        status: name === '101' ? ('dirty' as const) : ('clean' as const),
      })),
      guests: [
        {
          id: 'gst_anna',
          name: 'Anna Example',
          email: null,
          phone: null,
          language: 'de',
          notes: null,
        },
        {
          id: 'gst_jan',
          name: 'Jan Dvořák',
          email: null,
          phone: null,
          language: 'cs',
          notes: null,
        },
      ],
      bookings: [
        {
          ...stay,
          id: 'bk_anna',
          guestId: 'gst_anna',
          roomId: 'rm_104',
          checkIn: addDays(today, -1),
          checkOut: addDays(today, 2),
          adults: 2,
          status: 'checked_in',
        },
        {
          ...stay,
          id: 'bk_jan',
          guestId: 'gst_jan',
          roomId: 'rm_201',
          checkIn: today,
          checkOut: addDays(today, 3),
          adults: 1,
        },
      ],
      stayGuests: [
        {
          id: 'sg_bk_anna',
          bookingId: 'bk_anna',
          guestId: 'gst_anna',
          name: 'Anna Example',
          nationality: 'DE',
          dateOfBirth: '1986-04-20',
          documentType: 'id_card',
          documentNumber: 'DEMO00001',
          address: 'Demostraße 1, Berlin',
          registeredAt: now.toISOString(),
          createdAt: now.toISOString(),
        },
      ],
      charges: [
        { label: 'Sauna', quantity: 1, unitPrice: 300, id: 'chg_sauna' },
        { label: 'Minibar', quantity: 1, unitPrice: 120, id: 'chg_minibar' },
      ].map((c) => ({
        ...c,
        bookingId: 'bk_anna',
        amount: c.quantity * c.unitPrice,
        vatBracket: 'standard' as const,
        postedOn: today,
        createdAt: now.toISOString(),
      })),
    },
    clock,
  );
  let n = 0;
  const newId = (prefix: string) => `${prefix}_eval${++n}`;
  const hotel = createHotelService({
    repos,
    pricing: usDemoPricing,
    policy: hotelPolicy,
    clock,
    newId,
  });
  const billing = createBillingService({ repos, pricing: usDemoPricing, clock, newId });
  const registrations = createRegistrationService({ repos, clock, newId });
  const actions = createPendingActionService({
    repos,
    hotel,
    billing,
    registrations,
    guests: createGuestService({ repos, newId }),
    clock,
    newId,
  });
  const tools = createAgentTools({
    hotel,
    billing,
    reports: createReportService({ repos, pricing: usDemoPricing }),
    actions,
    housekeeping: createHousekeepingService({ repos, clock, newId }),
    registrations,
    listRooms: () => repos.rooms.listRooms(),
    listRoomTypes: () => repos.rooms.listRoomTypes(),
  });
  return { repos, tools };
}

/** Problems if the run did not propose exactly one action of `kind` whose input includes `input`. */
function proposed<K extends PendingActionInput['kind']>(
  hotel: EvalHotel,
  kind: K,
  input: Record<string, unknown>,
): string[] {
  const actions = hotel.repos.state.pendingActions;
  if (actions.length !== 1) {
    return [`expected 1 proposal, got ${actions.map((a) => a.kind).join(', ') || 'none'}`];
  }
  const action = actions[0]!;
  if (action.kind !== kind) return [`proposed ${action.kind}, not ${kind}`];
  const got = action.input as Record<string, unknown>;
  return Object.entries(input)
    .filter(([key, value]) => JSON.stringify(got[key]) !== JSON.stringify(value))
    .map(([key, value]) => `${key} ${JSON.stringify(got[key])}, expected ${JSON.stringify(value)}`);
}

/** Problems if anything was proposed or changed: the request only asked a question. */
function readOnly(hotel: EvalHotel): string[] {
  const { pendingActions, audit } = hotel.repos.state;
  return [
    ...(pendingActions.length > 0
      ? [`proposed ${pendingActions.map((a) => a.kind).join(', ')}`]
      : []),
    ...(audit.length > 0 ? [`changed ${audit.map((a) => a.action).join(', ')}`] : []),
  ];
}

function called(calls: EvalToolCall[], ...names: string[]): string[] {
  return calls.some((c) => names.includes(c.toolName))
    ? []
    : [`never called ${names.join(' or ')}`];
}

/** The app turns `[[bk_1]]` into a chip; an ID without brackets would show as raw text. */
function bareIds(answer: string): string[] {
  const bare = answer
    .replace(/\[\[(?:bk|rm|gst)_[A-Za-z0-9-]+\]\]/g, '')
    .match(/\b(?:bk|rm|gst)_\w+/g);
  return bare ? [`answer shows bare IDs ${bare.join(', ')}`] : [];
}

/** Problems unless the answer names each thing, by any of its names (a guest or their room). */
function mentions(answer: string, ...things: string[][]): string[] {
  return things
    .filter((names) => !names.some((n) => answer.includes(n)))
    .map((names) => `answer doesn't mention ${names.join(' or ')}`);
}

export const agentFixtures: AgentFixture[] = [
  {
    id: 'room-clean',
    prompt: 'Room 101 is clean now.',
    check: ({ hotel }) => {
      const room = hotel.repos.state.rooms.find((r) => r.id === 'rm_101');
      return [
        ...(room?.status === 'clean' ? [] : [`room 101 is ${room?.status}`]),
        ...(hotel.repos.state.pendingActions.length > 0 ? ['proposed instead of acting'] : []),
      ];
    },
  },
  {
    id: 'maintenance-task',
    prompt: 'The shower in 202 is leaking, please log it for maintenance.',
    check: ({ hotel }) => {
      const tasks = hotel.repos.state.tasks;
      const ok =
        tasks.length === 1 && tasks[0]!.roomId === 'rm_202' && tasks[0]!.type === 'maintenance';
      return ok ? [] : [`tasks ${JSON.stringify(tasks.map((t) => [t.roomId, t.type]))}`];
    },
  },
  {
    id: 'who-needs-id',
    prompt: 'Who still needs an ID in the guest book today?',
    check: ({ hotel, calls, answer }) => [
      ...readOnly(hotel),
      ...called(calls, 'getDailyBrief', 'getGuestBook'),
      ...mentions(answer, ['Dvořák', '201', '[[bk_jan]]']),
      // In the US only the guest who booked shows an ID, and Anna's is recorded.
      ...(/Anna|\[\[bk_anna\]\]/.test(answer) ? ['answer lists Anna, whose ID is recorded'] : []),
      ...bareIds(answer),
      ...(/Dvorak/.test(answer) ? ['answer drops the diacritics in Dvořák'] : []),
    ],
  },
  {
    id: 'add-companion',
    prompt:
      "Anna Example's husband Max Example is staying with her. He's German, born 12 March 1985, passport C01X00T47.",
    check: ({ hotel }) => {
      const problems = proposed(hotel, 'add_stay_guest', {
        bookingId: 'bk_anna',
        nationality: 'DE',
        dateOfBirth: '1985-03-12',
        documentType: 'passport',
        documentNumber: 'C01X00T47',
      });
      const name = (hotel.repos.state.pendingActions[0]?.input as { name?: string } | undefined)
        ?.name;
      return name?.includes('Max') ? problems : [...problems, `name ${name}`];
    },
  },
  {
    id: 'record-main-guest',
    prompt: 'Jan Dvořák just showed his Czech ID card: number 123456789, born 4 July 1990.',
    check: ({ hotel }) =>
      proposed(hotel, 'update_stay_guest', {
        bookingId: 'bk_jan',
        stayGuestId: 'sg_bk_jan',
        nationality: 'CZ',
        dateOfBirth: '1990-07-04',
        documentType: 'id_card',
        documentNumber: '123456789',
      }),
  },
  {
    id: 'remove-extra',
    prompt: "Take the sauna off Anna Example's bill, she didn't use it.",
    check: ({ hotel }) =>
      proposed(hotel, 'remove_charge', { bookingId: 'bk_anna', chargeId: 'chg_sauna' }),
  },
  {
    id: 'correct-extra',
    prompt: "The minibar on Anna Example's bill should be 2 items, not 1.",
    check: ({ hotel }) =>
      proposed(hotel, 'update_charge', {
        bookingId: 'bk_anna',
        chargeId: 'chg_minibar',
        quantity: 2,
      }),
  },
  {
    id: 'profile-email',
    prompt: "Anna Example's new email address is anna.example@example.com.",
    check: ({ hotel }) =>
      proposed(hotel, 'update_guest', { guestId: 'gst_anna', email: 'anna.example@example.com' }),
  },
  {
    id: 'arrivals-list',
    prompt: 'Who arrives today?',
    check: ({ hotel, calls, answer }) => [
      ...readOnly(hotel),
      ...called(calls, 'getArrivals', 'getDailyBrief', 'searchBookings'),
      ...(/^\s*[-•]\s*\[\[bk_jan\]\]/m.test(answer)
        ? []
        : ['answer has no list item leading with [[bk_jan]]']),
      ...bareIds(answer),
    ],
  },
  {
    id: 'guest-book-question',
    prompt: 'Kdo je zapsaný v knize hostů pokoje 104?',
    check: ({ hotel, calls, answer }) => [
      ...readOnly(hotel),
      ...called(calls, 'getGuestBook'),
      ...mentions(answer, ['Anna', '[[bk_anna]]', '[[gst_anna]]']),
      ...bareIds(answer),
    ],
  },
];
