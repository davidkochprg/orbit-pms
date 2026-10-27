import { describe, expect, it } from 'vitest';
import {
  comparisonRange,
  isReportPeriod,
  percent,
  periodRange,
  pointChange,
  relativeChange,
} from './reports';

describe('periodRange', () => {
  const today = '2026-10-27';

  it('covers past nights up to today, exclusive', () => {
    expect(periodRange('last7', today)).toEqual({ from: '2026-10-20', to: '2026-10-27' });
    expect(periodRange('last30', today)).toEqual({ from: '2026-09-27', to: '2026-10-27' });
  });

  it('covers whole calendar months, across the year end', () => {
    expect(periodRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(periodRange('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-10-01' });
    expect(periodRange('lastMonth', '2027-01-15')).toEqual({
      from: '2026-12-01',
      to: '2027-01-01',
    });
  });

  it('looks ahead for what is on the books', () => {
    expect(periodRange('next30', today)).toEqual({ from: '2026-10-27', to: '2026-11-26' });
  });
});

describe('comparisonRange', () => {
  it('is the same length right before, across a DST change', () => {
    expect(comparisonRange({ from: '2026-10-01', to: '2026-11-01' })).toEqual({
      from: '2026-08-31',
      to: '2026-10-01',
    });
    expect(comparisonRange({ from: '2026-10-20', to: '2026-10-27' })).toEqual({
      from: '2026-10-13',
      to: '2026-10-20',
    });
  });
});

describe('changes', () => {
  it('shows relative change with a sign, or nothing without a base', () => {
    expect(relativeChange(110, 100)).toEqual({ label: '+10%', direction: 'up' });
    expect(relativeChange(90, 100)).toEqual({ label: '-10%', direction: 'down' });
    expect(relativeChange(5, 0)).toBeNull();
  });

  it('shows occupancy change in points', () => {
    expect(pointChange(0.61, 0.52)).toEqual({ label: '+9 pts', direction: 'up' });
    expect(pointChange(0.5, 0.5)).toEqual({ label: '0 pts', direction: 'flat' });
  });

  it('rounds fractions to whole percent', () => {
    expect(percent(0.416)).toBe(42);
  });
});

describe('isReportPeriod', () => {
  it('accepts known presets only', () => {
    expect(isReportPeriod('month')).toBe(true);
    expect(isReportPeriod('year')).toBe(false);
    expect(isReportPeriod(null)).toBe(false);
  });
});
