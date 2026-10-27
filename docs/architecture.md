# Architecture

## Layers

Orbit PMS is a pnpm monorepo. Each layer has one job:

| Package           | Role                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `apps/web`        | React UI. No business logic.                                                 |
| `apps/api`        | Hono server. Thin routes that validate input and call the domain.            |
| `packages/domain` | Pure TypeScript business logic. No I/O except through repository interfaces. |
| `packages/db`     | Drizzle schema, migrations, seed, repository implementations.                |
| `packages/ai`     | Meta model provider, agent tools, prompts, evals.                            |
| `packages/shared` | zod schemas and types used across packages.                                  |

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

```mermaid
sequenceDiagram
  participant W as Web (Vite)
  participant A as API (Hono)
  participant R as Repositories (packages/db)
  participant P as Postgres / PGlite
  W->>A: GET /api/bookings?from&to (via Vite proxy)
  A->>A: validate query (zod, packages/shared)
  A->>R: listBookings(filter)
  R->>P: SQL (Drizzle)
  P-->>R: rows
  R-->>A: Booking[] (shared types)
  A-->>W: JSON
  W->>W: validate response (zod), cache (TanStack Query)
```

Repositories implement the interfaces declared in `packages/domain/src/repositories.ts`, so domain code never imports a database driver.
