import { describe, expect, it } from 'vitest';
import { paletteMatch } from './palette-match';

describe('paletteMatch', () => {
  it('finds a row when each typed word starts one of its words', () => {
    expect(paletteMatch('Ruby Lane ruby.lane@example.com gst_1', 'lane')).toBeGreaterThan(0);
    expect(paletteMatch('Go to Reports', 'go rep')).toBeGreaterThan(0);
    expect(paletteMatch('Adam Procházka Room 104 bk_147', '104')).toBeGreaterThan(0);
  });

  it('ignores accents and case', () => {
    expect(paletteMatch('Tomáš Novák', 'NOVAK')).toBeGreaterThan(0);
  });

  it('does not match letters scattered through other words', () => {
    expect(paletteMatch('Lukáš Vaněk lukas.vanek@example.com', 'lane')).toBe(0);
    expect(paletteMatch('Lea Hoffmann lea.hoffmann@example.com', 'lane')).toBe(0);
  });

  it('ranks a row whose first word matches above one that matches later', () => {
    expect(paletteMatch('Lane Cooper', 'lane')).toBeGreaterThan(paletteMatch('Ruby Lane', 'lane'));
  });

  it('shows every row before anything is typed', () => {
    expect(paletteMatch('Go to Today', '  ')).toBe(1);
  });
});
