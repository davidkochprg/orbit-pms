# 2. Deterministic domain, LLM orchestrates

## Context

LLMs are unreliable at arithmetic and at reasoning over calendars. A wrong price or a double booking costs a small hotel real money and trust.

## Decision

All pricing and availability logic is deterministic TypeScript in `packages/domain`. The LLM extracts intent, chooses which tool to call and drafts text. It never computes a price or decides availability itself; it repeats tool results.

## Consequences

- Pricing and availability are unit-tested like any other code.
- `quote()` returns a full line-item breakdown so the agent can show it verbatim.
- Prompts stay small and free of business rules.
