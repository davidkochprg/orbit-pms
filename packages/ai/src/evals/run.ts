import { hotelToday } from '@orbit/domain';
import type { Inquiry } from '@orbit/shared';
import { tokenCostMicroUsd, type TokenUsage } from '../cost';
import { extractMessage } from '../inbox';
import { createMetaProvider } from '../provider';
import { reasoningEffort, type ReasoningEffort } from '../reasoning';
import { readHousekeepingNote } from '../housekeeping';
import { evalRoomNames, housekeepingNoteFixtures } from './housekeeping-notes';
import { buildInquiryFixtures } from './inquiries';
import { scoreExtraction, scoreHousekeepingNote } from './score';

const {
  META_API_KEY,
  META_MODEL_AGENT,
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
  models: { agent: META_MODEL_AGENT },
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
      const inquiry: Inquiry = {
        id: f.id,
        rawText: f.rawText,
        channel: f.channel,
        partner: f.partner,
        subject: f.subject,
        senderName: f.senderName,
        senderAddress: f.senderAddress,
        receivedAt: new Date().toISOString(),
        parsed: null,
        suggestion: null,
        reply: null,
        status: 'new',
        bookingId: null,
        processedAt: null,
        processingError: null,
      };
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

process.exit(inboxOk && notesOk ? 0 : 1);
