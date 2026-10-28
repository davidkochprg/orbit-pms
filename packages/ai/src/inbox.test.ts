import {
  createHotelService,
  createInboxService,
  emptyHotelProfile,
  hotelPolicy,
  type PricingConfig,
} from '@orbit/domain';
import { createMemoryRepositories } from '@orbit/domain/testing';
import type { InquiryExtraction } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createInboxPipeline } from './inbox';
import { createTranslator } from './translate';
import type { UsageRecord } from './usage';

const now = new Date('2026-05-10T08:00:00Z');
const pricing: PricingConfig = {
  currency: 'CZK',
  pricingBasis: 'per_person',
  seasons: [],
  childDiscounts: [],
  longStay: [],
  wellness: { perPersonPerNight: 250, minAge: 0 },
  extraBed: { perNight: 0 },
  dog: { perNight: 0 },
  cityTax: { label: 'City tax', perPersonPerNight: 0, minAge: 18 },
  tax: {
    mode: 'inclusive',
    standard: { label: 'VAT', rate: 21 },
    reduced: { label: 'VAT', rate: 12 },
  },
};
const usageTokens = {
  inputTokens: { total: 800, noCache: 300, cacheRead: 500, cacheWrite: undefined },
  outputTokens: { total: 150, text: 150, reasoning: undefined },
};

const request: InquiryExtraction = {
  kind: 'booking_request',
  language: 'cs',
  guestName: 'Jana Testová',
  checkIn: '2026-05-12',
  checkOut: '2026-05-14',
  adults: 2,
  childAges: [],
  wishes: { wellness: true, dog: false, apartment: false },
  question: null,
};

/** 2 adults × 2 nights × 1000 + wellness 2 × 2 × 250 = 5 000 CZK. */
const TOTAL = '5 000 CZK';

function setup(replies: string[], { budgetLeft = true } = {}) {
  const repos = createMemoryRepositories(
    {
      roomTypes: [
        {
          id: 'rt_double',
          name: 'Double room',
          maxAdults: 2,
          maxChildren: 1,
          basePrice: 1000,
          description: '',
        },
      ],
      rooms: [
        {
          id: 'rm_1',
          name: '101',
          roomTypeId: 'rt_double',
          kind: 'room',
          floor: 1,
          status: 'clean',
        },
      ],
    },
    () => now,
  );
  let n = 0;
  const newId = (p: string) => `${p}_${++n}`;
  const clock = () => now;
  const hotel = createHotelService({ repos, pricing, policy: hotelPolicy, clock, newId });
  const inbox = createInboxService({ repos, hotel, clock, newId });
  const calls: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      calls.push(JSON.stringify(options.prompt));
      const text = replies[Math.min(calls.length - 1, replies.length - 1)] ?? '';
      return Promise.resolve({
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: usageTokens,
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
  const canSpend = () => Promise.resolve(budgetLeft);
  const pipeline = createInboxPipeline({
    model,
    modelId: 'muse-spark-1.3',
    hotel,
    inbox,
    hotelContext: () =>
      Promise.resolve({ profile: emptyHotelProfile, policy: hotelPolicy, pricing }),
    usage,
    canSpend,
    today: () => '2026-05-10',
    translator: createTranslator({ model, modelId: 'muse-spark-1.3', usage, canSpend }),
  });
  return { repos, inbox, pipeline, calls, records };
}

const message = {
  body: 'Dobrý den, máte pokoj pro 2 osoby 12.–14. 5.? I wellness. Jana',
  channel: 'email' as const,
  senderName: 'Jana Testová',
};

describe('inbox pipeline', () => {
  it('extracts, offers a priced room and drafts a reply with the exact total', async () => {
    const draft = `Dobrý den, paní Testová, dvoulůžkový pokoj na 2 noci s wellness stojí ${TOTAL}. Rádi vám ho podržíme.`;
    const { inbox, pipeline, records, calls } = setup([JSON.stringify(request), draft]);
    const msg = await inbox.create(message);
    const result = await pipeline.process(msg.id);

    expect(result.status).toBe('quoted');
    expect(result.parsed).toEqual(request);
    expect(result.suggestion?.options.map((o) => [o.roomName, o.quote.total])).toEqual([
      ['101', 5000],
    ]);
    expect(result.suggestion?.draft).toBe(draft);
    expect(result.suggestion?.draftLanguage).toBe('cs');
    expect(records.map((r) => r.feature)).toEqual(['inbox_extract', 'inbox_draft']);
    expect(records[0]?.tokens).toEqual({ input: 800, cachedInput: 500, output: 150 });
    // The draft prompt carries the computed total, so the model never has to calculate it.
    expect(calls[1]).toContain(TOTAL);
  });

  it('retries once when the draft states a wrong price', async () => {
    const good = `Pokoj stojí ${TOTAL}.`;
    const { inbox, pipeline, records, calls } = setup([
      JSON.stringify(request),
      'Pokoj stojí 4 800 CZK.',
      good,
    ]);
    const result = await pipeline.process((await inbox.create(message)).id);
    expect(result.suggestion?.draft).toBe(good);
    expect(calls[2]).toContain('4800');
    expect(records.filter((r) => r.feature === 'inbox_draft')).toHaveLength(2);
  });

  it('withholds the draft rather than show a wrong price', async () => {
    const { inbox, pipeline } = setup([
      JSON.stringify(request),
      'Stojí to 4 800 CZK.',
      'Stojí to 6 000 CZK.',
    ]);
    const result = await pipeline.process((await inbox.create(message)).id);
    expect(result.suggestion?.draft).toBeNull();
    expect(result.suggestion?.note).toMatch(/did not match/);
    expect(result.suggestion?.options).toHaveLength(1);
  });

  it('processes each message once', async () => {
    const { inbox, pipeline, calls } = setup([
      JSON.stringify(request),
      `Cena ${TOTAL}.`,
      JSON.stringify(request),
      `Cena ${TOTAL}.`,
    ]);
    const msg = await inbox.create(message);
    await pipeline.process(msg.id);
    await pipeline.process(msg.id);
    expect(calls).toHaveLength(2);
    await pipeline.process(msg.id, { force: true });
    expect(calls).toHaveLength(4);
  });

  it('answers a question without offering rooms or prices', async () => {
    const question: InquiryExtraction = {
      ...request,
      kind: 'question',
      checkIn: null,
      checkOut: null,
      adults: null,
      wishes: { wellness: false, dog: true, apartment: false },
      question: 'May they bring a small dog?',
    };
    const reply = 'Dobrý den, psi jsou vítáni v apartmánech.';
    const { inbox, pipeline } = setup([JSON.stringify(question), reply]);
    const result = await pipeline.process(
      (await inbox.create({ body: 'Můžeme vzít psa?', channel: 'ota', partner: 'Booking.com' })).id,
    );
    expect(result.status).toBe('new');
    expect(result.suggestion).toEqual({
      options: [],
      note: null,
      draft: reply,
      draftLanguage: 'cs',
      draftTranslation: null,
    });
  });

  it('does not call the model once the budget is spent', async () => {
    const { inbox, pipeline, calls } = setup([JSON.stringify(request)], { budgetLeft: false });
    const result = await pipeline.process((await inbox.create(message)).id);
    expect(calls).toHaveLength(0);
    expect(result.processingError).toMatch(/budget/);
    expect(result.parsed).toBeNull();
  });

  it('records invalid model output as a processing error and retries it next time', async () => {
    const { inbox, pipeline, calls } = setup(['not json at all']);
    const msg = await inbox.create(message);
    const failed = await pipeline.process(msg.id);
    expect(failed.processingError).toBeTruthy();
    expect(failed.parsed).toBeNull();
    await pipeline.process(msg.id);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("puts the draft side by side in the staff member's language", async () => {
    const draft = `Dobrý den, pokoj stojí ${TOTAL}.`;
    const english = `Hello, the room costs ${TOTAL}.`;
    const { inbox, pipeline, records } = setup([JSON.stringify(request), draft, english]);
    const result = await pipeline.process((await inbox.create(message)).id, { language: 'en' });
    expect(result.suggestion).toMatchObject({
      draft,
      draftLanguage: 'cs',
      draftTranslation: { language: 'en', text: english },
    });
    expect(records.map((r) => r.feature)).toEqual(['inbox_extract', 'inbox_draft', 'translate']);
  });

  it('skips the translation when staff read the guest language, or when it changes an amount', async () => {
    const draft = `Pokoj stojí ${TOTAL}.`;
    const same = setup([JSON.stringify(request), draft]);
    const czech = await same.pipeline.process((await same.inbox.create(message)).id, {
      language: 'cs',
    });
    expect(czech.suggestion?.draftTranslation).toBeNull();
    expect(same.calls).toHaveLength(2);

    const wrong = setup([JSON.stringify(request), draft, 'The room costs 4 800 CZK.']);
    const english = await wrong.pipeline.process((await wrong.inbox.create(message)).id, {
      language: 'en',
    });
    expect(english.suggestion?.draft).toBe(draft);
    expect(english.suggestion?.draftTranslation).toBeNull();
  });

  it('reads the whole conversation, answering the guest’s latest message', async () => {
    const { inbox, pipeline, calls } = setup([JSON.stringify(request), `Cena ${TOTAL}.`]);
    const msg = await inbox.create(message);
    await inbox.send(msg.id, 'Dobrý den, na kdy přesně?', null, 'user');
    await inbox.receive(msg.id, 'Od 12. do 14. května.');
    await pipeline.process(msg.id);
    expect(calls[0]).toContain('na kdy přesně');
    expect(calls[1]).toContain('Od 12. do 14. května.');
    expect(calls[1]).toContain("Reply to the guest's latest message");
  });
});
