import { describe, expect, it } from 'vitest';
import { callOptions } from '../test-setup';
import { agentFixtures, buildAgentEvalHotel } from './agent';

describe('agent eval fixtures', () => {
  it("builds a US inn where only the arriving guest's ID is missing", async () => {
    const hotel = buildAgentEvalHotel('2026-05-10');
    const brief = await hotel.tools.getDailyBrief.execute({}, callOptions);
    expect(brief).toMatchObject({
      missingIds: [expect.objectContaining({ missing: 1, arriving: true })],
    });
  });

  it('fails every case when the agent does nothing, so no check passes by default', () => {
    for (const fixture of agentFixtures) {
      const problems = fixture.check({
        hotel: buildAgentEvalHotel('2026-05-10'),
        calls: [],
        answer: '',
      });
      expect(problems, fixture.id).not.toEqual([]);
    }
  });
});
