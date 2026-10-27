# AI

## Agent loop

_Not built yet._

## Tools

_Not built yet._

## Approval pattern

Mutating tools return a `PendingAction` instead of executing. See [ADR 0004](decisions/0004-human-approval-for-mutations.md).

## Prompts

_Not built yet._

## Evals

`packages/ai/src/evals/inquiries.ts` holds ten synthetic inquiries (Czech, German, English, Polish), dated relative to today, each with its expected extraction: language, dates, adults, child ages, and wishes (wellness, dog, apartment). The demo seed uses the same inquiries.

`scoreExtraction(expected, actual)` scores an extraction by exact match on those fields; child age order and guest name are ignored. `pnpm eval` currently only loads the fixtures, because there is no extractor yet.

## Meta models

The Meta Model API is OpenAI-compatible, so `packages/ai/src/provider.ts` wraps the AI SDK's `@ai-sdk/openai-compatible` provider. `createMetaProvider(config)` takes the API key, base URL and model IDs; `apps/api` builds that config from env vars and leaves AI off when `META_API_KEY` or `META_MODEL_AGENT` is missing.

| Env var             | Used for                                               |
| ------------------- | ------------------------------------------------------ |
| `META_MODEL_AGENT`  | Agent loop and tool calling                            |
| `META_MODEL_VISION` | Vision features (optional)                             |
| `META_MODEL_VOICE`  | Voice transcription (optional; ID only, not wired yet) |

No model is called yet.

## Rate limits

_Not built yet._
