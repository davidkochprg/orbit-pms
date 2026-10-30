import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { workOrderPrompt } from './prompts/repairs';
import { createRepairDesk, parseWorkOrder } from './repairs';
import type { UsageRecord } from './usage';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function model(id: string, text: string) {
  return new MockLanguageModelV4({
    modelId: id,
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
        response: { modelId: id },
      }),
  });
}

const facts = {
  hotel: {
    name: 'Example Lodge',
    location: 'Example Valley',
    phone: '555 0199',
    checkOutBy: '11:00',
    checkInFrom: '15:00',
  },
  signer: 'Jordan',
  contact: { name: 'Example Plumbing', person: 'Sam', language: 'cs' as const },
  roomName: '203',
  issue: 'Bathroom tap is dripping.',
  access: { guestName: 'Avery Sample', freeFrom: '2026-11-05', freeUntil: '2026-11-07' },
  today: '2026-11-03',
};

describe('parseWorkOrder', () => {
  it('splits the subject line from the body', () => {
    expect(parseWorkOrder('Subject: Tap in room 203\n\nHi Sam,\n\nThanks!')).toEqual({
      subject: 'Tap in room 203',
      body: 'Hi Sam,\n\nThanks!',
    });
  });

  it('reads a subject in markdown or in the language of the email', () => {
    expect(parseWorkOrder('**Předmět: Kohoutek 203**\nDobrý den').subject).toBe('Kohoutek 203');
  });

  it('takes the first line as the subject when there is no subject line', () => {
    expect(parseWorkOrder('Tap in 203\nHi Sam')).toEqual({ subject: 'Tap in 203', body: 'Hi Sam' });
  });
});

describe('workOrderPrompt', () => {
  it('gives the days with weekdays, the language and when the room is free, without the guest', () => {
    const prompt = workOrderPrompt(facts);
    expect(prompt).toContain('Today is Tuesday, 2026-11-03.');
    expect(prompt).toContain('Write to: Example Plumbing, attention Sam');
    expect(prompt).toContain('Write in: Czech');
    expect(prompt).toContain('Sign as: Jordan, Example Lodge');
    expect(prompt).toContain('until Thursday, 2026-11-05 (check-out by 11:00)');
    expect(prompt).toContain('arrives Saturday, 2026-11-07 (check-in from 15:00)');
    expect(prompt).not.toContain('Avery');
  });

  it('says when nobody is in the room or booked after', () => {
    const prompt = workOrderPrompt({
      ...facts,
      access: { guestName: null, freeFrom: '2026-11-03', freeUntil: null },
    });
    expect(prompt).toContain('Nobody is in the room now.');
    expect(prompt).toContain('Nobody is booked into it after that.');
  });
});

describe('repair desk', () => {
  it('reads a trade and drafts an email, recording what each call cost', async () => {
    const records: UsageRecord[] = [];
    const desk = createRepairDesk({
      model: model('agent', '{"trade":"plumbing"}'),
      modelId: 'agent',
      draftModel: model('open', 'Subject: Tap in 203\n\nDobrý den,\nprosím o opravu.'),
      usage: {
        record: (r) => {
          records.push(r);
          return Promise.resolve();
        },
        monthToDateMicroUsd: () => Promise.resolve(0),
      },
    });
    expect(await desk.trade('Tap is dripping')).toBe('plumbing');
    expect(await desk.workOrder(facts)).toEqual({
      subject: 'Tap in 203',
      body: 'Dobrý den,\nprosím o opravu.',
    });
    expect(records.map((r) => [r.feature, r.model])).toEqual([
      ['repairs', 'agent'],
      ['repairs', 'open'],
    ]);
  });
});
