import { describe, expect, it } from 'vitest';
import { parsePinnedMinute, parseTheme, resolveDark } from './theme';

describe('resolveDark', () => {
  it('follows an explicit choice', () => {
    expect(resolveDark('dark', false)).toBe(true);
    expect(resolveDark('light', true)).toBe(false);
  });

  it('follows the OS for system', () => {
    expect(resolveDark('system', true)).toBe(true);
    expect(resolveDark('system', false)).toBe(false);
  });
});

describe('stored preferences', () => {
  it('accepts known themes and falls back to system', () => {
    expect(parseTheme('daylight')).toBe('daylight');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('sepia')).toBe('system');
    expect(parseTheme(null)).toBe('system');
  });

  it('accepts only whole minutes within a day as a pinned time', () => {
    expect(parsePinnedMinute('420')).toBe(420);
    expect(parsePinnedMinute('0')).toBe(0);
    expect(parsePinnedMinute('1440')).toBeNull();
    expect(parsePinnedMinute('7.5')).toBeNull();
    expect(parsePinnedMinute('')).toBeNull();
    expect(parsePinnedMinute(null)).toBeNull();
  });
});
