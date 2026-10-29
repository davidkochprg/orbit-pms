# 15. Muse Spark Open on Baseten for drafts and translations

## Context

Orbit runs on Muse Spark through the Meta Model API. Baseten granted $100 in credits for Muse Spark Open (`meta-models/muse-spark-open-1026`), Meta's open-weight release of Muse Spark, served through Baseten's OpenAI-compatible Model API at the same per-token prices. Baseten serves it without structured output or JSON mode, it always reasons (default `xhigh`, lowest `low`), and an unverified account may send 15 requests a minute. Using an open-weight model also shows that a hotel could run the language work on a model it hosts itself.

## Decision

- Inbox reply drafts and translations run on Muse Spark Open when `BASETEN_API_KEY` and `BASETEN_MODEL` are set. Both are plain text, so they need no structured output, and the price guard and amount check already verify every result, whatever model wrote it.
- The agent (tool calling, the most visible feature), inbox extraction, housekeeping notes and ID scans (all structured output) and speech-to-text stay on the Meta Model API.
- A failed Muse Spark Open call falls back to the same request on Meta's model (`withFallback`), so running out of Baseten credits or hitting its rate limit never breaks the inbox.
- Its reasoning effort comes from the same per-feature setting (`minimal`, run as `low` on Baseten), never Baseten's `xhigh` default.

## Consequences

- Runtime AI is still Meta models only, but no longer only through the Meta Model API; AGENTS.md says so.
- Usage rows name the model that answered, and Baseten spend counts towards the same monthly cap, since both cost the same per token.
- `pnpm eval` has a reply-draft suite, and `EVAL_SUITES=drafts,translations` measures the two features on whichever model the environment configures.
- On the evals (2026-10-29) it drafts as well as Muse Spark on the Meta Model API (14/14, translations 4/4) at about $0.004 instead of $0.0025 per draft, since `low` is its lowest reasoning level.
- Unsetting `BASETEN_API_KEY` moves both features back to Meta with no other change.
