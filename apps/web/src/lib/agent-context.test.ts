import { describe, expect, it } from 'vitest';
import { contextFromLocation } from './agent-context';

describe('contextFromLocation', () => {
  it('prefers an open booking inspector over the page under it', () => {
    expect(contextFromLocation('/guests/gst_1', '?booking=bk_9')).toEqual({
      kind: 'booking',
      id: 'bk_9',
    });
  });

  it('reads a guest profile and an inbox conversation', () => {
    expect(contextFromLocation('/guests/gst_1', '')).toEqual({ kind: 'guest', id: 'gst_1' });
    expect(contextFromLocation('/inbox/inq_4', '')).toEqual({ kind: 'inquiry', id: 'inq_4' });
  });

  it('has nothing to say about a page about nothing in particular', () => {
    expect(contextFromLocation('/', '')).toBeNull();
    expect(contextFromLocation('/guests', '')).toBeNull();
    expect(contextFromLocation('/inbox', '')).toBeNull();
  });
});
