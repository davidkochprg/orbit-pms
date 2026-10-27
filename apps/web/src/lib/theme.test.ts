import { describe, expect, it } from 'vitest';
import { resolveDark } from './theme';

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
