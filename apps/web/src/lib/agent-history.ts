import type { UIMessage } from 'ai';

/** A conversation with the agent, kept in the browser so staff can go back to it. */
export interface StoredConversation {
  id: string;
  /** The first question, as the conversation's name in the list. */
  title: string;
  updatedAt: string;
  messages: UIMessage[];
}

/** How many recent conversations are kept for each staff member. */
export const RECENT_CONVERSATIONS = 3;

const storageKey = (staffId: string) => `orbit.agent.${staffId}`;

function isConversation(value: unknown): value is StoredConversation {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.updatedAt === 'string' &&
    Array.isArray(c.messages)
  );
}

/** The staff member's recent conversations, newest first; empty when storage is unavailable. */
export function loadConversations(staffId: string): StoredConversation[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(staffId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isConversation) : [];
  } catch {
    return [];
  }
}

export function saveConversations(staffId: string, conversations: StoredConversation[]): void {
  try {
    localStorage.setItem(storageKey(staffId), JSON.stringify(conversations));
  } catch {
    // Full or blocked storage: the list lasts for this session only.
  }
}

/** The text of the conversation's first question. */
export function conversationTitle(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return '';
  return first.parts
    .flatMap((p) => (p.type === 'text' ? [p.text] : []))
    .join(' ')
    .trim();
}

/**
 * The messages worth keeping: a reply that broke off is left out, so a conversation picked up
 * later doesn't carry a half-made tool call.
 */
export function settledMessages(messages: UIMessage[], brokeOff: boolean): UIMessage[] {
  return brokeOff && messages.at(-1)?.role === 'assistant' ? messages.slice(0, -1) : messages;
}

/** The list with this conversation moved to the top, keeping only the most recent ones. */
export function upsertConversation(
  conversations: StoredConversation[],
  id: string,
  messages: UIMessage[],
  now: Date = new Date(),
): StoredConversation[] {
  const others = conversations.filter((c) => c.id !== id);
  if (messages.length === 0) return others;
  const updated = {
    id,
    title: conversationTitle(messages),
    updatedAt: now.toISOString(),
    messages,
  };
  return [updated, ...others].slice(0, RECENT_CONVERSATIONS);
}

// The lists in use, shared with React through `useSyncExternalStore`.
const lists = new Map<string, StoredConversation[]>();
const listeners = new Set<() => void>();

export function subscribeConversations(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The staff member's recent conversations; the same array until one of them changes. */
export function recentConversations(staffId: string): StoredConversation[] {
  let list = lists.get(staffId);
  if (!list) {
    list = loadConversations(staffId);
    lists.set(staffId, list);
  }
  return list;
}

/**
 * Keeps a conversation as it now stands. Nothing changes when it is already kept like this, so
 * opening an old conversation doesn't move it to the top.
 */
export function rememberConversation(staffId: string, id: string, messages: UIMessage[]): void {
  if (messages.length === 0) return;
  const list = recentConversations(staffId);
  const saved = list.find((c) => c.id === id);
  if (
    saved?.messages.length === messages.length &&
    saved.messages.at(-1)?.id === messages.at(-1)?.id
  ) {
    return;
  }
  const next = upsertConversation(list, id, messages);
  lists.set(staffId, next);
  saveConversations(staffId, next);
  for (const listener of listeners) listener();
}
