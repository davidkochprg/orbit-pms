import { describe, expect, it } from 'vitest';
import { agentErrorMessage, asProposal, asToolError } from './agent';

describe('agent helpers', () => {
  it('recognises proposal tool output', () => {
    const output = { pendingActionId: 'act_1', summary: 'Move', status: 'awaiting_confirmation' };
    expect(asProposal(output)).toEqual(output);
    expect(asProposal({ rooms: [] })).toBeNull();
  });

  it('extracts tool error messages', () => {
    expect(asToolError({ error: { code: 'conflict', message: 'Room 2 is taken' } })).toBe(
      'Room 2 is taken',
    );
    expect(asToolError([1, 2])).toBeNull();
  });

  it('shows API error messages such as the demo limit', () => {
    const body = JSON.stringify({
      error: { code: 'demo_limit', message: 'Demo limit reached for today.' },
    });
    expect(agentErrorMessage(new Error(body))).toBe('Demo limit reached for today.');
    expect(agentErrorMessage(new Error('socket hang up'))).toMatch(/unavailable/);
  });
});
