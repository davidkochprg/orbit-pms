import { describe, expect, it } from 'vitest';
import { mailKeyAction } from './mail-keys';

const press = (
  key: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe('mailKeyAction', () => {
  it('reads Gmail keys and leaves modified keys alone', () => {
    expect(mailKeyAction(press('e'), false)).toBe('archive');
    expect(mailKeyAction(press('#'), false)).toBe('trash');
    expect(mailKeyAction(press('U'), false)).toBe('unread');
    expect(mailKeyAction(press('e', { metaKey: true }), false)).toBeNull();
    expect(mailKeyAction(press('q'), false)).toBeNull();
  });

  it('reads "go to" pairs after g', () => {
    expect(mailKeyAction(press('g'), false)).toBe('g');
    expect(mailKeyAction(press('t'), true)).toBe('goSent');
    expect(mailKeyAction(press('e'), true)).toBeNull();
  });
});
