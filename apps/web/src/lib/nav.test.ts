import { describe, expect, it } from 'vitest';
import { navItems } from './nav';

describe('navItems', () => {
  it('has a unique path per section', () => {
    const paths = navItems.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
