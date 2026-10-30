import { createHousekeepingService } from '@orbit/domain';
import { createMemoryRepositories } from '@orbit/domain/testing';
import type { HousekeepingNoteReading } from '@orbit/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHousekeepingNotePipeline } from './housekeeping';
import type { UsageRecord } from './usage';

const now = new Date('2026-05-10T08:00:00Z');
const usageTokens = {
  inputTokens: { total: 400, noCache: 400, cacheRead: 0, cacheWrite: undefined },
  outputTokens: { total: 60, text: 60, reasoning: undefined },
};

afterEach(() => vi.unstubAllGlobals());

function setup(reading: HousekeepingNoteReading, { voice = true } = {}) {
  const repos = createMemoryRepositories(
    {
      rooms: [
        { id: 'rm_104', name: '104', roomTypeId: 'rt', kind: 'room', floor: 1, status: 'dirty' },
      ],
    },
    () => now,
  );
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(reading) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: usageTokens,
        warnings: [],
      });
    },
  });
  const records: UsageRecord[] = [];
  const pipeline = createHousekeepingNotePipeline({
    model,
    modelId: 'muse-spark-1.3',
    transcription: voice
      ? { apiKey: 'k', baseURL: 'https://meta.invalid/v1', model: 'muse-voice-transcribe-1.0' }
      : null,
    housekeeping: createHousekeepingService({ repos, clock: () => now, newId: (p) => `${p}_1` }),
    listRooms: () => repos.rooms.listRooms(),
    usage: {
      record: (r) => {
        records.push(r);
        return Promise.resolve();
      },
      monthToDateMicroUsd: () => Promise.resolve(0),
    },
  });
  return { repos, pipeline, prompts, records };
}

const reading: HousekeepingNoteReading = {
  updates: [
    { room: '104', status: 'clean', issue: 'Bedside lamp is broken.', trade: 'electrical' },
  ],
  unclear: null,
};

describe('housekeeping note pipeline', () => {
  it('reads a typed note with the room list and applies it as the agent', async () => {
    const { repos, pipeline, prompts, records } = setup(reading);
    const result = await pipeline.fromText('104 done, lamp broken');

    expect(prompts[0]).toContain('Rooms: 104');
    expect(result.changes.map((c) => c.kind)).toEqual(['room_status', 'task_created']);
    expect(repos.state.rooms[0]!.status).toBe('clean');
    expect(repos.state.audit.every((a) => a.actor === 'agent')).toBe(true);
    expect(records).toEqual([
      expect.objectContaining({ feature: 'voice', model: 'muse-spark-1.3', audioSeconds: 0 }),
    ]);
  });

  it('transcribes audio, records its cost and then applies the transcript', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Response.json({ transcript: '104 done, lamp broken', audioDurationMs: 3600, turns: [] }),
      ),
    );
    const { pipeline, records } = setup(reading);
    const result = await pipeline.fromAudio(new Uint8Array([1, 2, 3]));

    expect(result.transcript).toBe('104 done, lamp broken');
    expect(result.changes).toHaveLength(2);
    expect(records[0]).toMatchObject({
      feature: 'voice',
      model: 'muse-voice-transcribe-1.0',
      audioSeconds: 4,
      costMicroUsd: 200,
    });
  });

  it('reports silence without calling the model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Response.json({ transcript: '  ', audioDurationMs: 2000, turns: [] })),
    );
    const { pipeline, prompts } = setup(reading);
    const result = await pipeline.fromAudio(new Uint8Array([1]));
    expect(result).toMatchObject({ changes: [], unclear: 'Nothing was heard.' });
    expect(prompts).toEqual([]);
  });

  it('refuses audio when no voice model is configured', async () => {
    const { pipeline } = setup(reading, { voice: false });
    expect(pipeline.canTranscribe).toBe(false);
    await expect(pipeline.fromAudio(new Uint8Array([1]))).rejects.toThrow('No voice model');
  });
});
