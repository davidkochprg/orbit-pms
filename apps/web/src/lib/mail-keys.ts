/** What a key press in the inbox asks for, Gmail style. */
export type MailKeyAction =
  | 'compose'
  | 'search'
  | 'next'
  | 'previous'
  | 'list'
  | 'select'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'archive'
  | 'trash'
  | 'star'
  | 'unread'
  | 'read'
  | 'help'
  | 'goInbox'
  | 'goStarred'
  | 'goSent'
  | 'goDrafts';

const single: Record<string, MailKeyAction> = {
  c: 'compose',
  '/': 'search',
  j: 'next',
  k: 'previous',
  u: 'list',
  x: 'select',
  r: 'reply',
  a: 'replyAll',
  f: 'forward',
  e: 'archive',
  '#': 'trash',
  s: 'star',
  U: 'unread',
  I: 'read',
  '?': 'help',
};

const afterG: Record<string, MailKeyAction> = {
  i: 'goInbox',
  s: 'goStarred',
  t: 'goSent',
  d: 'goDrafts',
};

export interface KeyPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/**
 * The action for a key, given whether "g" was just pressed. Returns `'g'` when the key starts a
 * "go to" pair, and null for keys the inbox leaves alone, including any with ⌘, Ctrl or Alt.
 */
export function mailKeyAction(e: KeyPress, afterGoKey: boolean): MailKeyAction | 'g' | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (afterGoKey) return afterG[e.key] ?? null;
  if (e.key === 'g') return 'g';
  return single[e.key] ?? null;
}

/** Whether the key was typed into a field, where it is text and not a shortcut. */
export function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/** Gmail's keys, as the inbox understands them. */
export const mailShortcuts: { keys: string[]; does: string }[] = [
  { keys: ['c'], does: 'Compose' },
  { keys: ['/'], does: 'Search' },
  { keys: ['j'], does: 'Next conversation' },
  { keys: ['k'], does: 'Previous conversation' },
  { keys: ['u'], does: 'Back to the list' },
  { keys: ['x'], does: 'Select the open conversation' },
  { keys: ['r'], does: 'Reply' },
  { keys: ['a'], does: 'Reply all' },
  { keys: ['f'], does: 'Forward' },
  { keys: ['e'], does: 'Archive' },
  { keys: ['#'], does: 'Move to trash' },
  { keys: ['s'], does: 'Star' },
  { keys: ['Shift', 'u'], does: 'Mark as unread' },
  { keys: ['Shift', 'i'], does: 'Mark as read' },
  { keys: ['g', 'i'], does: 'Go to Inbox' },
  { keys: ['g', 's'], does: 'Go to Starred' },
  { keys: ['g', 't'], does: 'Go to Sent' },
  { keys: ['g', 'd'], does: 'Go to Drafts' },
  { keys: ['⌘', 'Enter'], does: 'Send' },
  { keys: ['?'], does: 'These shortcuts' },
];
