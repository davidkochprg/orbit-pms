import { emptyHotelProfile, hotelPolicy, usDemoPricing } from '@orbit/domain';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import {
  type ArrivalNoteFacts,
  ArrivalNoteError,
  arrivalNoteProblems,
  createArrivalNoteWriter,
} from './arrival-notes';
import { arrivalNotePrompt } from './prompts/arrival-notes';
import type { HotelContext } from './prompts/hotel';
import type { UsageRecord } from './usage';

const hotel: HotelContext = {
  profile: {
    ...emptyHotelProfile,
    name: 'Test Lodge',
    country: 'US',
    checkInFrom: '15:00',
    entries: [
      { id: 'p', category: 'policies', title: 'Parking', details: 'Parking is $20 a night.' },
    ],
  },
  policy: hotelPolicy,
  pricing: usDemoPricing,
};

const facts: ArrivalNoteFacts = {
  guest: { name: 'Mia Wagner', language: 'de' },
  stay: {
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    adults: 2,
    childAges: [8],
    roomTypeName: 'King room',
    addons: { wellness: true, dogs: 1, extraBeds: 0 },
  },
  weather: {
    date: '2026-11-01',
    kind: 'snow',
    tempMinC: -7,
    tempMaxC: 2,
    precipitationMm: 4,
    snowfallCm: 5.6,
  },
  idsFrom: 'main_guest',
  signer: 'Jordan Lee',
  today: '2026-10-31',
};

function writer(replies: string[]) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return Promise.resolve({
        content: [{ type: 'text', text: replies[prompts.length - 1] ?? '' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 200, text: 200, reasoning: undefined },
        },
        warnings: [],
      });
    },
  });
  const records: UsageRecord[] = [];
  const usage = {
    record: (r: UsageRecord) => {
      records.push(r);
      return Promise.resolve();
    },
    monthToDateMicroUsd: () => Promise.resolve(0),
  };
  return {
    prompts,
    records,
    notes: createArrivalNoteWriter({ model, usage, hotelContext: () => Promise.resolve(hotel) }),
  };
}

describe('arrivalNotePrompt', () => {
  it('gives the model the stay, what was booked, the forecast and the ID rule', () => {
    const prompt = arrivalNotePrompt(facts, hotel);
    expect(prompt).toContain('Write in: German');
    expect(prompt).toContain('Arrives: Sunday, 2026-11-01, check-in from 3 PM');
    expect(prompt).toContain('(2 nights)');
    expect(prompt).toContain('for 2 adults and children aged 8');
    expect(prompt).toContain('Booked: wellness (spa) for the stay, 1 dog');
    expect(prompt).toContain('snow, -7 to 2 °C, 5.6 cm of snow');
    expect(prompt).toContain('a photo ID for the guest who booked');
  });
});

describe('arrivalNoteProblems', () => {
  it('accepts amounts the facts state and refuses others, Markdown and empty notes', () => {
    const ok = { subject: 'Bis morgen', body: 'Parken kostet $20 pro Nacht.' };
    expect(arrivalNoteProblems(ok, [20])).toEqual([]);
    expect(arrivalNoteProblems({ ...ok, body: 'Ihr Zimmer kostet $318.' }, [20])).toEqual([
      "it states amounts the facts don't (318)",
    ]);
    expect(arrivalNoteProblems({ subject: '', body: '**Hallo**' }, [])).toEqual([
      'it has no subject line',
      'it uses Markdown',
    ]);
  });
});

describe('createArrivalNoteWriter', () => {
  it('returns the subject and body, recording the call', async () => {
    const { notes, records } = writer(['Subject: Bis morgen\n\nLiebe Mia,\nbis morgen!']);
    expect(await notes.write(facts)).toEqual({
      subject: 'Bis morgen',
      body: 'Liebe Mia,\nbis morgen!',
    });
    expect(records.map((r) => r.feature)).toEqual(['arrival_note']);
  });

  it('writes again once when the note states an amount the facts do not, then refuses', async () => {
    const wrong = 'Subject: Bis morgen\n\nIhr Zimmer kostet $318.';
    const retried = writer([wrong, 'Subject: Bis morgen\n\nParken kostet $20.']);
    expect((await retried.notes.write(facts)).body).toBe('Parken kostet $20.');
    expect(retried.prompts[1]).toContain('rejected');

    const failing = writer([wrong, wrong]);
    await expect(failing.notes.write(facts)).rejects.toBeInstanceOf(ArrivalNoteError);
    expect(failing.records).toHaveLength(2);
  });
});
