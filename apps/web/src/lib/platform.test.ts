import { describe, expect, it } from 'vitest';
import { isApplePlatform, modShortcut } from './platform';

describe('platform shortcuts', () => {
  it('recognises Apple platforms', () => {
    expect(isApplePlatform('MacIntel')).toBe(true);
    expect(isApplePlatform('iPad')).toBe(true);
    expect(isApplePlatform('Win32')).toBe(false);
    expect(isApplePlatform('Linux x86_64')).toBe(false);
  });

  it('labels the modifier for the platform', () => {
    expect(modShortcut('K', true)).toBe('⌘K');
    expect(modShortcut('K', false)).toBe('Ctrl K');
    expect(modShortcut('↵', false)).toBe('Ctrl ↵');
  });
});
