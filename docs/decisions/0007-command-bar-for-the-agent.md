# 7. Command bar for the agent

## Context

The agent should feel part of the app, not a chat window bolted onto it ([ADR 0006](0006-agent-autonomy-and-cost-budget.md)). A permanent side panel takes width from the tape chart, which needs every pixel, and turns the agent into a separate destination. Staff already expect ⌘K search in tools like Linear and Raycast.

## Decision

The agent lives in the ⌘K command bar. Typing searches guests, today's arrivals and departures and pages; Enter on "Ask Orbit" sends the text to the agent, and the answer, its tool steps and any confirm cards appear in the same bar. Escape steps back to search, then closes. The conversation is kept while the bar is closed. Pages open the bar with context through `useCommandPalette()`, for example "Ask Orbit" in the booking inspector.

## Consequences

- No layout space is reserved for the agent; the tape chart uses the full width.
- One keyboard entry point covers search, navigation and the agent.
- Long conversations are less comfortable in a centered bar than in a side panel. Background work (inbox preparation, later housekeeping and check-in) is shown where it happens, not in the bar.
