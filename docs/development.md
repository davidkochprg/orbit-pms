# Development

## Local setup

Requirements: Node 24 or newer, pnpm 11 (`corepack enable` picks the version from `package.json`). No database install is needed.

```bash
pnpm i
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173 (Vite, proxies `/api` and `/health` to the API)
- API: http://localhost:3001

To use the AI features, copy `.env.example` to `.env` at the repo root and fill in the Meta variables. Without them the app runs with AI off, and the sidebar shows "AI not configured".

## Environment variables

Read from `.env` at the repo root by the API and the db scripts, and validated with zod at startup (`apps/api/src/env.ts`). All of them are server-side; the web bundle gets none.

| Variable                 | Default                  | Purpose                                   |
| ------------------------ | ------------------------ | ----------------------------------------- |
| `DATABASE_URL`           | `file:./.data/orbit`     | PGlite path, or a `postgres://` URL       |
| `META_API_KEY`           | –                        | Meta Model API key                        |
| `META_API_BASE_URL`      | `https://api.meta.ai/v1` | OpenAI-compatible base URL                |
| `META_MODEL_AGENT`       | –                        | Model for the agent loop and tool calling |
| `META_MODEL_VOICE`       | –                        | Transcription model for voice notes       |
| `META_MODEL_VISION`      | –                        | Vision-capable model                      |
| `AI_DAILY_TOKEN_BUDGET`  | `500000`                 | Global daily token budget                 |
| `AI_RATE_LIMIT_PER_HOUR` | `20`                     | Agent calls per IP per hour               |
| `PORT`                   | `3001`                   | API port                                  |

The two limits are parsed but not enforced yet.

## Scripts

| Command            | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `pnpm dev`         | API (`tsx watch`) and web (Vite) in parallel                  |
| `pnpm build`       | Production build of the web app                               |
| `pnpm typecheck`   | `tsc --noEmit` in every package                               |
| `pnpm lint`        | ESLint (type-aware) and Prettier check                        |
| `pnpm format`      | Prettier write                                                |
| `pnpm test`        | Vitest across all packages                                    |
| `pnpm db:generate` | Drizzle migration from schema changes                         |
| `pnpm db:migrate`  | Apply migrations                                              |
| `pnpm db:seed`     | Replace all data with the demo seed                           |
| `pnpm eval`        | Extraction evals (only loads fixtures until the agent exists) |

Internal packages are consumed as TypeScript source (`workspace:*`, `exports` pointing at `src/index.ts`), so there is no per-package build step.

## Git hooks

Husky runs commitlint on every commit message, rejects AI attribution trailers, refuses to commit local agent config in `.claude/` (also gitignored), and runs `typecheck` and `lint` before each commit. See `AGENTS.md` for the commit conventions.

## Database

`packages/db` holds the Drizzle schema (`src/schema.ts`), migrations (`drizzle/`) and repository implementations.

- `DATABASE_URL` unset or `file:<path>`: local [PGlite](https://pglite.dev) (embedded Postgres), stored at `<path>` relative to the repo root. Default `file:./.data/orbit`.
- `DATABASE_URL=postgres://…`: a real Postgres server, e.g. Neon. See [ADR 0005](decisions/0005-pglite-for-local-development.md).

After changing `schema.ts`, run `pnpm db:generate` and commit the new file in `packages/db/drizzle/`. `pnpm db:migrate` applies pending migrations and is safe to re-run.

A PGlite directory can only be open in one process at a time, so stop `pnpm dev` before running `pnpm db:seed`. To start from scratch, delete `.data/`.

## Seeding

`pnpm db:seed` replaces all data with a synthetic demo set built by `buildSeed(today, now, pricingConfig)`. Every date is relative to today in `Europe/Prague`, so the demo looks the same whenever it runs:

- 12 rooms: 101–105 and 201–205 (double and family rooms), apartments A1 and A2.
- 34 synthetic guests in Czech, German, English and Polish. Emails use `example.com`.
- About 66 bookings from three weeks ago to six weeks ahead, priced with `quote()`. There are always arrivals and departures today, at least one family arrival, and a couple of open holds.
- 10 open inquiries in mixed languages (from `packages/ai/src/evals/inquiries.ts`). The seed makes sure each one has at least one free room.
- Housekeeping tasks: turnovers for today's departures, stayovers for in-house guests, one maintenance task.

The generator is deterministic (fixed PRNG seed), and its invariants are tested in `packages/db/src/seed/build.test.ts`.

## Deploying

_Not set up yet._
