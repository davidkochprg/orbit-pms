import { describe, expect, it } from 'vitest';
import { parseTheme, resolveDark } from './theme';

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
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('daylight')).toBe('system');
    expect(parseTheme('sepia')).toBe('system');
    expect(parseTheme(null)).toBe('system');
  });
});
