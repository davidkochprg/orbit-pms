import { readFile } from 'node:fs/promises';
import {
  emptyHotelProfile,
  getHotelTimeZone,
  hotelPolicy,
  hotelToday,
  usDemoPricing,
} from '@orbit/domain';
import { conversation } from '@orbit/domain/testing';
import { runAgent } from '../agent';
import { fromSdkUsage, tokenCostMicroUsd, type TokenUsage } from '../cost';
import { buildSystemPrompt } from '../prompts/system';
import { extractMessage } from '../inbox';
import { createMetaProvider } from '../provider';
import { reasoningEffort, type ReasoningEffort } from '../reasoning';
import { readHousekeepingNote } from '../housekeeping';
import { readIdDocument } from '../id-scan';
import { agentFixtures, buildAgentEvalHotel } from './agent';
import { evalRoomNames, housekeepingNoteFixtures } from './housekeeping-notes';
import { idDocumentFixtures } from './id-documents';
import { buildInquiryFixtures } from './inquiries';
import { translationFixtures } from './translations';
import { createTranslator } from '../translate';
import { scoreExtraction, scoreHousekeepingNote, scoreIdReading } from './score';

const {
  META_API_KEY,
  META_MODEL_AGENT,
  META_MODEL_VISION,
  META_API_BASE_URL = 'https://api.meta.ai/v1',
} = process.env;
if (!META_API_KEY || !META_MODEL_AGENT) {
  console.error(
    'pnpm eval needs META_API_KEY and META_MODEL_AGENT in .env (it calls the real model).',
  );
  process.exit(1);
}

const provider = createMetaProvider({
  apiKey: META_API_KEY,
  baseURL: META_API_BASE_URL,
  models: { agent: META_MODEL_AGENT, ...(META_MODEL_VISION && { vision: META_MODEL_VISION }) },
});
// EVAL_REASONING overrides the configured effort, to compare levels before changing the default.
const levels: ReasoningEffort[] = [
  'provider-default',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
const override = process.env.EVAL_REASONING || undefined;
if (override && !levels.includes(override as ReasoningEffort)) {
  console.error(`EVAL_REASONING must be one of: ${levels.join(', ')}`);
  process.exit(1);
}
const reasoning = override as ReasoningEffort | undefined;
const today = hotelToday(new Date());

interface CaseResult {
  passed: boolean;
  label: string;
  detail?: string;
  tokens: TokenUsage;
}

/** Runs one suite, prints a line per case and a summary; returns whether every case passed. */
async function suite(
  name: string,
  effort: ReasoningEffort,
  cases: { id: string; run: () => Promise<CaseResult> }[],
): Promise<boolean> {
  console.log(`\n${name} (reasoning ${effort})`);
  let passed = 0;
  let costMicroUsd = 0;
  let outputTokens = 0;
  const started = Date.now();
  for (const c of cases) {
    try {
      const result = await c.run();
      costMicroUsd += tokenCostMicroUsd(result.tokens);
      outputTokens += result.tokens.output;
      if (result.passed) passed++;
      console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${c.id}  ${result.label}`);
      if (!result.passed && result.detail) console.log(result.detail);
    } catch (err) {
      console.log(`ERROR ${c.id}  ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const rate = Math.round((passed / cases.length) * 100);
  const seconds = (Date.now() - started) / 1000;
  console.log(`${passed}/${cases.length} passed (${rate}%) with ${META_MODEL_AGENT}`);
  console.log(
    `cost $${(costMicroUsd / 1e6).toFixed(4)}, ${Math.round(outputTokens / cases.length)} output tokens and ${(seconds / cases.length).toFixed(1)} s per case`,
  );
  return passed === cases.length;
}

const extractionEffort = reasoning ?? reasoningEffort.extraction;
const inboxOk = await suite(
  'Inbox extraction',
  extractionEffort,
  buildInquiryFixtures(today).map((f) => ({
    id: f.id,
    run: async () => {
      const inquiry = conversation({
        id: f.id,
        body: f.rawText,
        channel: f.channel,
        partner: f.partner,
        subject: f.subject,
        senderName: f.senderName,
        senderAddress: f.senderAddress,
        receivedAt: new Date().toISOString(),
      });
      const { analysis, tokens } = await extractMessage(
        provider.agent,
        inquiry,
        today,
        extractionEffort,
      );
      const score = scoreExtraction(f.expected, analysis);
      return {
        passed: score.passed,
        label: `${f.expected.language}  ${score.failed.join(', ')}`,
        detail: `      expected ${JSON.stringify(f.expected)}\n      actual   ${JSON.stringify(analysis)}`,
        tokens,
      };
    },
  })),
);

const noteEffort = reasoning ?? reasoningEffort.housekeeping;
const notesOk = await suite(
  'Housekeeping notes',
  noteEffort,
  housekeepingNoteFixtures.map((f) => ({
    id: f.id,
    run: async () => {
      const { reading, tokens } = await readHousekeepingNote(
        provider.agent,
        f.note,
        evalRoomNames,
        noteEffort,
      );
      const score = scoreHousekeepingNote(f, reading);
      return {
        passed: score.passed,
        label: `${f.language}  ${score.problems.join(', ')}`,
        detail: `      note     ${f.note}\n      actual   ${JSON.stringify(reading)}`,
        tokens,
      };
    },
  })),
);

const vision = provider.vision;
const idEffort = reasoning ?? reasoningEffort.idScan;
const idsOk = vision
  ? await suite(
      'ID scans',
      idEffort,
      idDocumentFixtures.map((f) => ({
        id: f.id,
        run: async () => {
          const bytes = new Uint8Array(
            await readFile(new URL(`./id-documents/${f.file}`, import.meta.url)),
          );
          const { reading, tokens } = await readIdDocument(
            vision,
            { bytes, mediaType: 'image/jpeg' },
            idEffort,
          );
          const score = scoreIdReading(f.expected, reading);
          return {
            passed: score.passed,
            label: score.failed.join(', '),
            detail: `      expected ${JSON.stringify(f.expected)}\n      actual   ${JSON.stringify(reading)}`,
            tokens,
          };
        },
      })),
    )
  : (console.log('\nID scans skipped: set META_MODEL_VISION to run them.'), true);

const agentEffort = reasoning ?? reasoningEffort.agent;
const agentOk = await suite(
  'Agent tools',
  agentEffort,
  agentFixtures.map((f) => ({
    id: f.id,
    run: async () => {
      const hotel = buildAgentEvalHotel(today);
      const result = runAgent({
        model: provider.agent,
        system: buildSystemPrompt({
          hotel: {
            profile: { ...emptyHotelProfile, name: 'Eval Lodge' },
            policy: hotelPolicy,
            pricing: usDemoPricing,
          },
          today,
          timezone: getHotelTimeZone(),
        }),
        messages: [{ role: 'user', content: f.prompt }],
        tools: hotel.tools,
        ...(reasoning && { reasoning }),
      });
      await result.consumeStream();
      const calls = (await result.steps).flatMap((s) =>
        s.toolCalls.map((c) => ({ toolName: c.toolName, input: c.input })),
      );
      const answer = await result.text;
      const problems = f.check({ hotel, calls, answer });
      return {
        passed: problems.length === 0,
        label: problems.join('; '),
        detail: `      prompt   ${f.prompt}\n      calls    ${calls.map((c) => `${c.toolName} ${JSON.stringify(c.input)}`).join(' | ')}\n      answer   ${answer.replace(/\n/g, ' ')}`,
        tokens: fromSdkUsage(await result.totalUsage),
      };
    },
  })),
);

const translateEffort = reasoningEffort.translate;
const translateOk = await suite(
  'Translations',
  translateEffort,
  translationFixtures.map((f) => ({
    id: f.id,
    run: async () => {
      const tokens: TokenUsage[] = [];
      const translator = createTranslator({
        model: provider.translate,
        modelId: provider.translateModelId,
        usage: {
          record: (r) => {
            tokens.push(r.tokens);
            return Promise.resolve();
          },
          monthToDateMicroUsd: () => Promise.resolve(0),
        },
        canSpend: () => Promise.resolve(true),
      });
      const text = await translator.translate(f.text, f.to).catch((e: unknown) => String(e));
      const problems = f.check(text);
      return {
        passed: problems.length === 0,
        label: `${f.to}  ${problems.join('; ')}`,
        detail: `      text     ${f.text.replace(/\n/g, ' ')}\n      actual   ${text.replace(/\n/g, ' ')}`,
        tokens: tokens.reduce(
          (a, t) => ({
            input: a.input + t.input,
            cachedInput: a.cachedInput + t.cachedInput,
            output: a.output + t.output,
          }),
          { input: 0, cachedInput: 0, output: 0 },
        ),
      };
    },
  })),
);

process.exit(inboxOk && notesOk && idsOk && agentOk && translateOk ? 0 : 1);
