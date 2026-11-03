import { describe, expect, it } from 'vitest';
import { contextFromLocation, parseRangeId, rangeId } from './agent-context';

describe('contextFromLocation', () => {
  it('prefers an open booking inspector over the page under it', () => {
    expect(contextFromLocation('/guests', '?guest=gst_1&booking=bk_9')).toEqual({
      kind: 'booking',
      id: 'bk_9',
    });
  });

  it('reads a guest profile and an inbox conversation, but not a new email', () => {
    expect(contextFromLocation('/inbox', '?guest=gst_1')).toEqual({ kind: 'guest', id: 'gst_1' });
    expect(contextFromLocation('/inbox/inq_4', '')).toEqual({ kind: 'inquiry', id: 'inq_4' });
    expect(contextFromLocation('/inbox/new', '?draft=drf_1')).toBeNull();
  });

  it('reads an open repair, contact or note', () => {
    expect(contextFromLocation('/housekeeping', '?repair=hk_3')).toEqual({
      kind: 'repair',
      id: 'hk_3',
    });
    expect(contextFromLocation('/contacts', '?contact=ct_1')).toEqual({
      kind: 'contact',
      id: 'ct_1',
    });
    expect(contextFromLocation('/knowledge', '?note=sauna')).toEqual({ kind: 'note', id: 'sauna' });
  });

  it('has nothing to say about a page about nothing in particular', () => {
    expect(contextFromLocation('/', '')).toBeNull();
    expect(contextFromLocation('/guests', '')).toBeNull();
    expect(contextFromLocation('/inbox', '')).toBeNull();
    expect(contextFromLocation('/knowledge', '?new')).toBeNull();
  });
});

describe('range IDs', () => {
  it('round-trips the nights of a range and refuses anything else', () => {
    expect(parseRangeId(rangeId('2026-11-02', '2026-11-15'))).toEqual({
      from: '2026-11-02',
      to: '2026-11-15',
    });
    expect(parseRangeId('bk_1')).toBeNull();
  });
});
