# 8. Hotel profile in settings

## Context

The agent and the reply drafts need to know the property: policies, facilities, opening hours, directions. These facts lived in a constant in `packages/ai`, so only a developer could change them, and the agent could not answer anything the constant left out. Some rules (how long a hold lasts, where dogs may stay) are also enforced by the domain, and a free-text copy of them can drift.

## Decision

The hotel profile is data: one `hotel_profile` row edited in Settings, with property details and a list of entries (`policy`, `amenity`, `info`). Prompts are built from it on every agent turn and draft. Rules the domain enforces stay in `hotelPolicy` and are written into the prompt from there, never typed by staff. Prices stay in the pricing config and `quote()`.

## Consequences

- A manager can teach the agent about the property without a deploy; the next message uses the change.
- The facts block has no dates, so it is identical between calls and Meta's prefix cache still applies. A long profile costs input tokens on every turn; the schema caps it at 100 entries.
- The price guard accepts amounts the profile states, so a fee written in Settings may appear in a draft. Everything else must still come from a quote.
