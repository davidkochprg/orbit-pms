import { hotelToday } from '@orbit/domain';
import type { Inquiry } from '@orbit/shared';
import { tokenCostMicroUsd } from '../cost';
import { extractMessage } from '../inbox';
import { createMetaProvider } from '../provider';
import { reasoningEffort, type ReasoningEffort } from '../reasoning';
import { buildInquiryFixtures } from './inquiries';
import { scoreExtraction } from './score';

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
const reasoning = (override as ReasoningEffort | undefined) ?? reasoningEffort.extraction;
const today = hotelToday(new Date());
const fixtures = buildInquiryFixtures(today);

let passed = 0;
let costMicroUsd = 0;
let outputTokens = 0;
const started = Date.now();
for (const f of fixtures) {
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
  try {
    const { analysis, tokens } = await extractMessage(provider.agent, inquiry, today, reasoning);
    costMicroUsd += tokenCostMicroUsd(tokens);
    outputTokens += tokens.output;
    const score = scoreExtraction(f.expected, analysis);
    if (score.passed) passed++;
    console.log(
      `${score.passed ? 'PASS' : 'FAIL'}  ${f.id}  ${f.expected.language}  ${score.failed.join(', ')}`,
    );
    if (!score.passed)
      console.log(
        `      expected ${JSON.stringify(f.expected)}\n      actual   ${JSON.stringify(analysis)}`,
      );
  } catch (err) {
    console.log(`ERROR ${f.id}  ${err instanceof Error ? err.message : String(err)}`);
  }
}

const rate = Math.round((passed / fixtures.length) * 100);
const seconds = (Date.now() - started) / 1000;
console.log(
  `\n${passed}/${fixtures.length} passed (${rate}%) with ${META_MODEL_AGENT}, reasoning ${reasoning}`,
);
console.log(
  `cost $${(costMicroUsd / 1e6).toFixed(4)}, ${Math.round(outputTokens / fixtures.length)} output tokens and ${(seconds / fixtures.length).toFixed(1)} s per message`,
);
process.exit(passed === fixtures.length ? 0 : 1);
