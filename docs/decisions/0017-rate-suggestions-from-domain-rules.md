# 17. Rate suggestions from domain rules, explained by the model

## Context

Small hotels rarely change prices night by night, though demand does: a local event fills the town, fresh snow brings skiers, a quiet midweek stays empty. Orbit already keeps the bookings that show demand, and staff wanted the Office pages to help with prices. AGENTS.md says the LLM never computes prices or availability. Asking the model to "suggest a rate" from the data would break that rule and give numbers nobody can check.

## Decision

- A night's rate can carry a percent on top of its season (`adjustments` in the rates), which `quote()` applies. Changes come from a manager on the Rates page or from an agent proposal someone confirms.
- Suggestions are computed by the domain (`revenue.ts`) from explicit, small rules: how full the night is against the usual for that weekday over the last eight weeks, the biggest local event, and the weather forecast. Each rule adds a labelled percent; the sum is rounded and capped. With no factor the night keeps its change.
- The forecast comes from Open-Meteo (free, no key) for coordinates in the hotel profile, fetched by the API, cached for three hours, and left out when it fails. Local events are entered by a manager; the demo seeds mock ones.
- The model only reads and explains: a short summary on request, checked so it states no percent the outlook doesn't, and agent tools that read the outlook and propose changes.
- No-show chances use how a stay was booked (channel, deposit) and the guest's own history, never nationality or anything else about who the guest is.

## Consequences

- Every suggested percent comes with its reasons, so a manager can see why and disagree. The rule values are illustrative for the demo, not tuned on a real hotel.
- Suggestions work without AI configured; the summary and the agent tools need it.
- The API makes one outside call that isn't a model, to Open-Meteo, and works without it.
- Existing bookings keep their price, as with any rate change.
