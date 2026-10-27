import { describe, expect, it } from 'vitest';
import * as mod from './index';

describe('@orbit/db', () => {
  it('loads', () => {
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});
