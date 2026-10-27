import { describe, expect, it } from 'vitest';
import { navItemFor, navItems } from './nav';

describe('navItems', () => {
  it('has a unique path per section', () => {
    const paths = navItems.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('navItemFor', () => {
  it('matches Today only at the root', () => {
    expect(navItemFor('/')?.label).toBe('Today');
    expect(navItemFor('/unknown')).toBeUndefined();
  });

  it('matches nested paths to their section', () => {
    expect(navItemFor('/guests/gst_cs_01')?.label).toBe('Guests');
    expect(navItemFor('/settings/team')?.label).toBe('Settings');
  });
});
