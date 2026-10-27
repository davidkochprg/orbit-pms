import { describe, expect, it } from 'vitest';
import { navItemFor, navItems } from './nav';

describe('navItems', () => {
  it('has a unique path per section', () => {
    const paths = navItems.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('navItemFor', () => {
  it('matches the dashboard only at the root', () => {
    expect(navItemFor('/')?.label).toBe('Dashboard');
    expect(navItemFor('/unknown')).toBeUndefined();
  });

  it('matches nested paths to their section', () => {
    expect(navItemFor('/guests/gst_cs_01')?.label).toBe('Guests');
  });
});
