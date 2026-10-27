# Architecture

## Layers

Orbit PMS is a pnpm monorepo. Each layer has one job:

| Package | Role |
|---|---|
| `apps/web` | React UI. No business logic. |
| `apps/api` | Hono server. Thin routes that validate input and call the domain. |
| `packages/domain` | Pure TypeScript business logic. No I/O except through repository interfaces. |
| `packages/db` | Drizzle schema, migrations, seed, repository implementations. |
| `packages/ai` | Meta model provider, agent tools, prompts, evals. |
| `packages/shared` | zod schemas and types used across packages. |

## The architecture rule

UI actions and agent tools call the same domain functions.

```mermaid
flowchart LR
  UI[apps/web] -- HTTP --> API[apps/api routes]
  API --> D[packages/domain]
  Agent[Agent] --> T[packages/ai tools]
  T --> D
  D -. repository interfaces .-> DB[packages/db]
```

## Data flow

_Filled in as features land._
