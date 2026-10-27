# 3. Shared domain functions for UI and agent

## Context

Orbit is meant to be operated either by clicking or by asking. If the UI and the agent had separate code paths, they would drift apart and behave differently.

## Decision

UI actions (via `apps/api` routes) and agent tools (in `packages/ai`) are thin wrappers over the same functions in `packages/domain`. No business logic lives in routes, components or prompts.

## Consequences

- Anything the UI can do, the agent can do, with identical results.
- A new capability is added once in the domain, then exposed as a route and a tool.
- Inputs at both edges are validated with the same zod schemas from `packages/shared`.
