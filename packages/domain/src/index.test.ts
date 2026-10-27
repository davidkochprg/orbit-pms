import { describe, expect, it } from 'vitest';
import * as mod from './index';

describe('@orbit/domain', () => {
  it('loads', () => {
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});
