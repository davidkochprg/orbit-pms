import type { Inquiry } from '@orbit/shared';
import { describe, expect, it } from 'vitest';
import {
  addressBook,
  conversationFiles,
  formatBytes,
  formatRecipient,
  forwardBody,
  forwardSubject,
  newDraftId,
  parseRecipients,
  replyAllCc,
  suggestAddresses,
  uniqueRecipients,
} from './mail';

const message = (overrides: Partial<Inquiry['messages'][number]>) => ({
  id: 'msg',
  inquiryId: 'inq',
  direction: 'in' as const,
  body: 'Hello',
  sentAt: '2026-10-27T08:00:00.000Z',
  author: null,
  translation: null,
  to: [],
  cc: [],
  bcc: [],
  attachments: [],
  ...overrides,
});

const thread = (messages: Inquiry['messages']): Inquiry =>
  ({
    id: 'inq',
    channel: 'email',
    subject: 'Wedding',
    senderName: 'Quinn Example',
    senderAddress: 'quinn@example.com',
    messages,
  }) as Inquiry;

describe('recipients', () => {
  it('reads addresses and named addresses, and flags the rest', () => {
    expect(parseRecipients('a@example.com; "Riley Example" <riley@example.com>,\nnope')).toEqual({
      recipients: [
        { name: null, address: 'a@example.com' },
        { name: 'Riley Example', address: 'riley@example.com' },
      ],
      invalid: ['nope'],
    });
    expect(formatRecipient({ name: 'Riley', address: 'r@example.com' })).toBe(
      'Riley <r@example.com>',
    );
    expect(
      uniqueRecipients([
        { name: 'A', address: 'a@example.com' },
        { name: null, address: 'A@example.com' },
      ]),
    ).toHaveLength(1);
  });

  it('suggests contacts, guests and people from the mailbox, best matches first', () => {
    const book = addressBook(
      [{ name: 'Riley Example', email: 'riley@example.com' }],
      [{ name: 'Ridgeline Plumbing', person: 'Sam', email: 'dispatch@ridgeline.example' }],
      [thread([message({ cc: [{ name: 'Casey Ri', address: 'casey@example.com' }] })])],
    );
    expect(book.map((e) => e.kind)).toEqual(['contact', 'guest', 'mail', 'mail']);
    expect(suggestAddresses(book, 'ri', []).map((e) => e.address)).toEqual([
      'riley@example.com',
      'casey@example.com',
      'dispatch@ridgeline.example',
    ]);
    expect(
      suggestAddresses(book, 'ri', [{ name: null, address: 'RILEY@example.com' }]),
    ).toHaveLength(2);
    expect(suggestAddresses(book, ' ', [])).toEqual([]);
  });
});

describe('reply all and forward', () => {
  const m = thread([
    message({
      cc: [
        { name: 'Riley', address: 'riley@example.com' },
        { name: 'Hotel', address: 'desk@hotel.example' },
      ],
    }),
    message({
      direction: 'out',
      author: 'Jordan',
      to: [{ name: null, address: 'quinn@example.com' }],
    }),
  ]);

  it('copies everyone on the thread but the guest and the hotel', () => {
    expect(replyAllCc(m, 'desk@hotel.example')).toEqual([
      { name: 'Riley', address: 'riley@example.com' },
    ]);
  });

  it('quotes the whole conversation and keeps one Fwd prefix', () => {
    expect(forwardSubject('Wedding')).toBe('Fwd: Wedding');
    expect(forwardSubject('FW: Wedding')).toBe('FW: Wedding');
    const body = forwardBody(m, 'Example Lodge');
    expect(body).toContain('From: Quinn Example <quinn@example.com>');
    expect(body).toContain('Cc: Riley <riley@example.com>');
    expect(body).toContain('From: Jordan, Example Lodge');
  });

  it('carries each file of the conversation once', () => {
    const f = { id: 'att_1', name: 'a.pdf', contentType: 'application/pdf', size: 1 };
    expect(
      conversationFiles(thread([message({ attachments: [f] }), message({ attachments: [f] })])),
    ).toEqual([f]);
  });
});

describe('formatting', () => {
  it('writes file sizes and makes valid draft IDs', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(312 * 1024)).toBe('312 KB');
    expect(formatBytes(1.4 * 1024 * 1024)).toBe('1.4 MB');
    expect(newDraftId()).toMatch(/^drf_[a-f0-9]{16}$/);
  });
});
