# 22. A model review grades rate signals; the domain sets the percent

## Context

Rate suggestions came from fixed rules alone ([ADR 0017](0017-rate-suggestions-from-domain-rules.md)): demand against the weekday's usual, local events and the weather. Most nights showed the same +5 or +10 or nothing, and the rules miss what a manager would notice: a public holiday, a team asking for a block of rooms in a message, several requests for the same weekend. Reading messages in any language and knowing a country's holidays is what the model is good at. AGENTS.md still says the model never computes prices.

## Decision

- The rules got finer: demand is graded by how far a night is ahead of or behind its usual, the nights either side of an event get a lift, and heavy snow counts more than fresh snow.
- Muse Spark reviews the outlook at `high` reasoning: the nights as the rules see them, the events, the hotel's location and country, and the open guest requests. It returns at most eight signals, each a run of nights, up or down, a strength (`slight`, `moderate`, `strong`) and its evidence in words. It never states a number; a signal that does is dropped.
- The domain turns each strength into a percent (±5, ±10, ±15) and adds it as an `insight` factor next to the rules' factors, with the same rounding and limits. The model grades; the domain prices.
- The latest review is stored with a fingerprint of what it read. The Rates page asks for a new review whenever the fingerprint changes (a booking, an event, a request, a forecast, a new day); otherwise no model call is made. Its signals count until the next review, for the agent too.

## Consequences

- Suggestions change with the inbox and the calendar: a group request or a holiday shows on its nights with the reason, and a manager can see why and disagree, as before.
- A review takes about 25 s and a few cents; the page shows the rule-based suggestions meanwhile. `pnpm eval` has a `rates` suite for it.
- Without AI configured, the finer rules still work and there are no insights.
- One more table (`rate_reviews`, migration 0023).
