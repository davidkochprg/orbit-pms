# 26. No AI limits in the demo

## Context

[ADR 0006](0006-agent-autonomy-and-cost-budget.md) capped AI spend at a persisted monthly budget and gave the public demo per-IP hourly and daily token limits on top. In judging and demos the limits got in the way: a judge working through the agent, the inbox and the rates in one sitting could hit them and see "Demo limit reached" instead of the feature. The deployed demo is already private behind its access code ([ADR 0014](0014-vercel-build-output-and-demo-access-code.md)), and the expected spend is small.

## Decision

Orbit sets no limit of its own on AI calls: the per-IP hourly limit, the daily token budget and the monthly spend cap are removed, with their `AI_RATE_LIMIT_PER_HOUR`, `AI_DAILY_TOKEN_BUDGET` and `AI_MONTHLY_BUDGET_USD` variables. Every model call is still recorded in `ai_usage`, and `GET /api/ai-usage` still reports this month's spend.

## Consequences

- No AI feature answers `429 demo_limit` any more; the access code is the only gate on the deployed demo.
- Spend is bounded only by the provider account (Meta credits, Baseten's own rate limit) and must be watched in `GET /api/ai-usage` or the provider's console.
- The cost rules of ADR 0006 still apply: calls are metered, background work runs once and is stored, prompts are cached and tool loops capped.
