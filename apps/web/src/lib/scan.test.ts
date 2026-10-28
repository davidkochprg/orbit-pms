import { describe, expect, it } from 'vitest';
import { fitWithin } from './photo';
import { isLocalOnly, scanUrl } from './scan';

describe('scanUrl', () => {
  it('links the phone page on the same origin', () => {
    expect(scanUrl('https://orbit.example.com', 'a_b-c')).toBe(
      'https://orbit.example.com/scan/a_b-c',
    );
  });
});

describe('isLocalOnly', () => {
  it('spots addresses a phone cannot reach', () => {
    expect(isLocalOnly('localhost')).toBe(true);
    expect(isLocalOnly('127.0.0.1')).toBe(true);
    expect(isLocalOnly('192.168.1.20')).toBe(false);
    expect(isLocalOnly('orbit.example.com')).toBe(false);
  });
});

describe('fitWithin', () => {
  it('scales the long edge down and never up', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
