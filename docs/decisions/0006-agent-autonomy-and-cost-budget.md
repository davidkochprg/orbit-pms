# 6. Agent autonomy and cost budget

## Context

The agent should feel built in: work happens where the staff already are (inbox, check-in, housekeeping), not only in a chat panel. But a real small property must stay in control and pay little. Target: under $100 a month in Meta API spend for a 30-room property.

## Decision

**Autonomy.** The agent may act without asking when the action is read-only or low-risk and reversible: reading, extracting, classifying, quoting, drafting replies, setting room status from housekeeping voice notes, and creating maintenance tasks. Anything that changes a booking, or sends a message to a guest, is proposed and needs one click ([ADR 0004](0004-human-approval-for-mutations.md)). Everything is logged.

**Cost.** Every model call is recorded in `ai_usage` with tokens and cost at Meta's list price. A persisted monthly cap (`AI_MONTHLY_BUDGET_USD`) is checked before each call; the demo also has per-IP and daily limits. Background work runs once per item and is cached, never on every page view. Prompts put stable content first so Meta's automatic prefix cache applies, chat history is trimmed, and tool loops are capped.

## Consequences

- Estimated spend for a 30-room property is $35–45 a month (see [ai.md](../ai.md#cost)); actual spend is visible at `GET /api/ai-usage`.
- When the budget is reached, AI features stop and the rest of Orbit keeps working.
- Contributor-tier models are cheaper but let Meta train on prompts, so they are not used with real guest data.
