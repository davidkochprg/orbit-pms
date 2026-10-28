import { describe, expect, it } from 'vitest';
import { balanceLabel, canCharge, vatRateLabel } from './billing';

describe('canCharge', () => {
  it('allows extras on confirmed and in-house stays only', () => {
    expect(canCharge({ status: 'confirmed' })).toBe(true);
    expect(canCharge({ status: 'checked_in' })).toBe(true);
    expect(canCharge({ status: 'hold' })).toBe(false);
    expect(canCharge({ status: 'checked_out' })).toBe(false);
    expect(canCharge({ status: 'cancelled' })).toBe(false);
  });
});

describe('balanceLabel', () => {
  it('names the balance by its sign', () => {
    expect(balanceLabel(120)).toBe('Balance due');
    expect(balanceLabel(-50)).toBe('Owed to guest');
    expect(balanceLabel(0)).toBe('Paid in full');
  });
});

describe('vatRateLabel', () => {
  it('shows the rate, or that a line is outside VAT', () => {
    expect(vatRateLabel('reduced', 12)).toBe('12%');
    expect(vatRateLabel('none', 0)).toBe('No VAT');
  });
});
