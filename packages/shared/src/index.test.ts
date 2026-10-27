import { describe, expect, it } from 'vitest';
import * as mod from './index';

describe('@orbit/shared', () => {
  it('loads', () => {
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});
