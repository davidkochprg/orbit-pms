import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { accessDays } from '@orbit/domain';
import type { Inquiry } from '@orbit/shared';
import { repairReplyPrompt, workOrderPrompt } from './prompts/repairs';
import { createRepairDesk, createRepairReplier, parseWorkOrder } from './repairs';
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

describe('repairReplyPrompt', () => {
  const reply = {
    ...facts,
    days: accessDays(facts.access, facts.today, 7),
    messages: [
      { from: 'hotel' as const, date: '2026-11-02', body: 'Could you come?' },
      { from: 'contractor' as const, date: '2026-11-03', body: 'Tomorrow at 9?' },
    ],
  };

  it('lists the room day by day until the next stay, and the conversation, without the guest', () => {
    const prompt = repairReplyPrompt(reply);
    expect(prompt).toContain('- Tuesday, 2026-11-03 (today): a guest is staying, no work');
    expect(prompt).toContain('- Thursday, 2026-11-05: free from 11:00, after the guest checks out');
    expect(prompt).toContain('- Friday, 2026-11-06: free all day');
    expect(prompt).toContain(
      '- Saturday, 2026-11-07: free until 15:00, when the next guest arrives',
    );
    expect(prompt).toContain('- From Sunday, 2026-11-08 on: booked, no work');
    expect(prompt).not.toContain('2026-11-09');
    expect(prompt).toContain('Contractor, Tuesday, 2026-11-03:\n"""\nTomorrow at 9?\n"""');
    expect(prompt).toContain('Write in: Czech');
    expect(prompt).not.toContain('Avery');
  });
});

describe('repair replier', () => {
  it("answers in the contractor's language with the repair, its days and the thread", async () => {
    const seen: string[] = [];
    const replier = createRepairReplier({
      desk: {
        reply: (f) => {
          seen.push(repairReplyPrompt(f));
          return Promise.resolve('Dobrý den, zítra v 9 nám to nevyjde.');
        },
      },
      repair: (taskId) =>
        Promise.resolve({
          task: {
            id: taskId,
            roomId: 'rm_203',
            type: 'maintenance',
            status: 'in_progress',
            notes: facts.issue,
            trade: 'plumbing',
            contactId: 'ct_1',
            createdAt: '2026-11-02T08:00:00.000Z',
          },
          roomName: '203',
          access: facts.access,
          contacts: [],
          contact: {
            id: 'ct_1',
            trades: ['plumbing'],
            phone: null,
            email: 'p@example.com',
            notes: null,
            ...facts.contact,
          },
          emails: [],
        }),
      contact: () => Promise.reject(new Error('not needed')),
      hotel: () => Promise.resolve(facts.hotel),
      today: () => facts.today,
      dayOf: (at) => at.toISOString().slice(0, 10),
    });
    const thread = {
      id: 'inq_1',
      taskId: 'hk_1',
      senderName: 'Example Plumbing',
      messages: [
        { direction: 'out', body: 'Could you come?', sentAt: '2026-11-02T09:00:00.000Z' },
        { direction: 'in', body: 'Tomorrow at 9?', sentAt: '2026-11-03T07:00:00.000Z' },
      ],
    } as unknown as Inquiry;
    expect(await replier(thread)).toEqual({
      text: 'Dobrý den, zítra v 9 nám to nevyjde.',
      language: 'cs',
    });
    expect(seen[0]).toContain('Problem: Bathroom tap is dripping.');
    expect(seen[0]).toContain('Hotel, Monday, 2026-11-02');
    await expect(replier({ ...thread, taskId: null })).rejects.toThrow('not about a repair');
  });
});
