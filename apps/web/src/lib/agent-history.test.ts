import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  conversationTitle,
  RECENT_CONVERSATIONS,
  settledMessages,
  type StoredConversation,
  upsertConversation,
} from './agent-history';

const user = (id: string, text: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});
const assistant = (id: string, text: string): UIMessage => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }],
});

const stored = (id: string): StoredConversation => ({
  id,
  title: id,
  updatedAt: '2026-10-30T10:00:00.000Z',
  messages: [user(`${id}-q`, id)],
});

describe('conversationTitle', () => {
  it('is the first question', () => {
    expect(conversationTitle([user('1', 'How does today look?'), user('2', 'And tomorrow?')])).toBe(
      'How does today look?',
    );
  });

  it('is empty before anything was asked', () => {
    expect(conversationTitle([])).toBe('');
  });
});

describe('settledMessages', () => {
  const q = user('1', 'Which rooms are dirty?');
  const a = assistant('2', 'Rooms 101 and');

  it('leaves out a reply that broke off', () => {
    expect(settledMessages([q, a], true)).toEqual([q]);
  });

  it('keeps a question still waiting for its reply', () => {
    expect(settledMessages([q], true)).toEqual([q]);
  });

  it('keeps everything once the reply is done', () => {
    expect(settledMessages([q, a], false)).toEqual([q, a]);
  });
});

describe('upsertConversation', () => {
  const now = new Date('2026-10-30T12:00:00.000Z');

  it('puts a new conversation first, named by its question', () => {
    const list = upsertConversation([stored('a')], 'b', [user('1', 'Any arrivals?')], now);
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ title: 'Any arrivals?', updatedAt: now.toISOString() });
  });

  it('moves a continued conversation back to the top', () => {
    const list = upsertConversation(
      [stored('a'), stored('b')],
      'b',
      [user('1', 'b'), assistant('2', 'ok')],
      now,
    );
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
    expect(list[0]?.messages).toHaveLength(2);
  });

  it(`keeps only the ${RECENT_CONVERSATIONS} most recent`, () => {
    const list = upsertConversation(
      [stored('a'), stored('b'), stored('c')],
      'd',
      [user('1', 'd')],
      now,
    );
    expect(list.map((c) => c.id)).toEqual(['d', 'a', 'b']);
  });

  it('drops a conversation with no messages', () => {
    expect(upsertConversation([stored('a'), stored('b')], 'a', [], now).map((c) => c.id)).toEqual([
      'b',
    ]);
  });
});
