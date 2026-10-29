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

To use the AI features, copy `.env.example` to `.env` at the repo root and fill in the Meta variables. Without them the app runs with AI off, and the ⌘K command bar shows "Agent not configured".

## Environment variables

Read from `.env` at the repo root by the API and the db scripts, and validated with zod at startup (`apps/api/src/env.ts`). All of them are server-side; the web bundle gets none.

| Variable                 | Default                  | Purpose                                                             |
| ------------------------ | ------------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`           | `file:./.data/orbit`     | PGlite path, or a `postgres://` URL                                 |
| `META_API_KEY`           | –                        | Meta Model API key                                                  |
| `META_API_BASE_URL`      | `https://api.meta.ai/v1` | OpenAI-compatible base URL                                          |
| `META_MODEL_AGENT`       | –                        | Model for the agent loop and tool calling                           |
| `META_MODEL_VOICE`       | –                        | Transcription model for voice notes                                 |
| `META_MODEL_VISION`      | –                        | Vision model for ID scans                                           |
| `META_MODEL_TRANSLATE`   | `META_MODEL_AGENT`       | Model for translating messages and drafts                           |
| `HOTEL_TIMEZONE`         | `America/Los_Angeles`    | The hotel's IANA time zone; decides "today"                         |
| `SEED_REGION`            | `us`                     | `pnpm db:seed` preset: `us` (demo lodge) or `cz` (Czech guesthouse) |
| `AI_DAILY_TOKEN_BUDGET`  | `2000000`                | Global daily token budget                                           |
| `AI_RATE_LIMIT_PER_HOUR` | `20`                     | Agent calls per IP per hour                                         |
| `AI_MONTHLY_BUDGET_USD`  | `100`                    | Monthly cap on real Meta spend                                      |
| `PORT`                   | `3001`                   | API port                                                            |

The hourly and daily limits are kept in memory; the monthly budget is computed from the `ai_usage` table. See [ai.md](ai.md#rate-limits).

## Scripts

| Command            | What it does                                                                      |
| ------------------ | --------------------------------------------------------------------------------- |
| `pnpm dev`         | API (`tsx watch`) and web (Vite) in parallel                                      |
| `pnpm dev:lan`     | Same, with the web app open to the local network (phone scans)                    |
| `pnpm build`       | Production build of the web app                                                   |
| `pnpm typecheck`   | `tsc --noEmit` in every package                                                   |
| `pnpm lint`        | ESLint (type-aware) and Prettier check                                            |
| `pnpm format`      | Prettier write                                                                    |
| `pnpm test`        | Vitest across all packages                                                        |
| `pnpm db:generate` | Drizzle migration from schema changes                                             |
| `pnpm db:migrate`  | Apply migrations                                                                  |
| `pnpm db:seed`     | Replace all data with the demo seed                                               |
| `pnpm db:reset`    | Delete the local PGlite database, then migrate and seed                           |
| `pnpm eval`        | AI evals against the real model: inbox, housekeeping notes, ID scans, agent tools |

Internal packages are consumed as TypeScript source (`workspace:*`, `exports` pointing at `src/index.ts`), so there is no per-package build step.

## Git hooks

Husky runs commitlint on every commit message, rejects AI attribution trailers, refuses to commit local agent config in `.claude/` (also gitignored), and runs `typecheck` and `lint` before each commit. See `AGENTS.md` for the commit conventions.

## Database

`packages/db` holds the Drizzle schema (`src/schema.ts`), migrations (`drizzle/`) and repository implementations.

- `DATABASE_URL` unset or `file:<path>`: local [PGlite](https://pglite.dev) (embedded Postgres), stored at `<path>` relative to the repo root. Default `file:./.data/orbit`.
- `DATABASE_URL=postgres://…`: a real Postgres server, e.g. Neon. See [ADR 0005](decisions/0005-pglite-for-local-development.md).

After changing `schema.ts`, run `pnpm db:generate` and commit the new file in `packages/db/drizzle/`. `pnpm db:migrate` applies pending migrations and is safe to re-run.

A PGlite directory can only be open in one process at a time; two processes writing to it corrupt it. The database therefore takes a lock file (`.data/orbit.lock`, holding the process ID), and a second process fails with "The local database is in use by process …". Stop `pnpm dev` (Ctrl-C) before running `pnpm db:migrate` or `pnpm db:seed`. A lock left by a crashed process is taken over automatically. If the local database ever gets into a bad state, for example a migration fails with "already exists" or a script hangs, run `pnpm db:reset` to delete it and start fresh. It refuses to run against a `postgres://` URL.

## Seeding

`pnpm db:seed` replaces all data with a synthetic demo set built by `buildSeed(today, now, region)`. `SEED_REGION` picks the hotel ([ADR 0013](decisions/0013-configurable-region-us-demo.md)): `us` (default) is the fictional Orbit Demo Lodge in the Sierra Nevada, California, with an English-speaking team, per-room rates in dollars and occupancy and sales tax added on the bill; `cz` is the Czech guesthouse, in crowns per person with VAT included. For `cz` also set `HOTEL_TIMEZONE=Europe/Prague`. Every date is relative to today in the hotel's time zone, so the demo looks the same whenever it runs:

- 50 rooms of six types: double, family, single, superior double and junior suite rooms on floors 1–4 (101–111, 201–211, 301–311, 401–411), and apartments A1–A6 on the ground floor.
- 240 synthetic guests in Czech, German, Polish and English: a few hand-picked names plus first name and surname combinations. Emails use `example.com`. No guest has two stays at once.
- About 440 bookings from three weeks ago to six weeks ahead, filling about half the hotel on a typical night, priced with `quote()`. There are always arrivals and departures today, at least one family arrival, and some open holds.
- 14 open guest messages in mixed languages (from `packages/ai/src/evals/inquiries.ts`), unread. The seed makes sure each booking request has at least one free room.
- Three conversations with history (`packages/db/src/seed/conversations.ts`): a Booking.com exchange about a late arrival, linked to its booking; an archived thank-you about a lost charger; and a welcome email the hotel wrote first.
- The team reads English (Czech for `cz`), so drafts and guest messages translate into it; change it per person in Settings › Team. Guests stay multinational either way.
- Bills: extras on past and current stays, deposits by bank transfer on some bookings, and settled bills for guests who left. Guests leaving today still owe something. Extra prices are placeholders.
- Guest-book registrations for every stay that has started, with synthetic `DEMO-` document numbers and placeholder addresses. Today's arrivals are not registered yet; returning guests prefill from an earlier stay.
- Housekeeping tasks: turnovers for today's departures, stayovers for in-house guests, one maintenance task.
- The hotel profile of the fictional "Orbit Demo Lodge" or "Orbit Demo Penzion" (`packages/db/src/seed/hotel.ts`): policies, amenities and guest information, without prices. Seeding replaces any profile edited in Settings.
- The rates from `packages/domain/src/pricing/config.ts`: `usDemoPricing` (illustrative) or the Czech placeholders. Seeding replaces any rates, room types and rooms edited in Settings.

The generator is deterministic (fixed PRNG seed), and its invariants are tested in `packages/db/src/seed/build.test.ts`.

## Deploying

Orbit runs on Vercel with a Neon Postgres database ([ADR 0014](decisions/0014-vercel-build-output-and-demo-access-code.md)). `pnpm build:vercel` builds the web app, bundles the API into one Node.js function with esbuild, and writes both to `.vercel/output` (the [Build Output API](https://vercel.com/docs/build-output-api)), which Vercel deploys as is. `vercel.json` points the project at that command.

| Path                | Served by                                                             |
| ------------------- | --------------------------------------------------------------------- |
| `/api/*`, `/health` | The API function (Node.js 24, streaming on, 120 s limit)              |
| `/assets/*`         | The CDN, cached for a year (file names carry a content hash)          |
| Anything else       | `index.html`, revalidated on every visit; React Router takes it there |

There is no server rendering and no ISR, so nothing is ever written to Vercel's cache: the app is static files plus one function. API answers are `Cache-Control: private, no-store`, and every page sends `X-Robots-Tag: noindex`.

Environment variables in the Vercel project:

- `DATABASE_URL`: Neon's **pooled** connection string (host with `-pooler`). The function connects without prepared statements, which PgBouncer's transaction mode needs.
- `DEMO_ACCESS_CODE`: the code visitors must enter. Unset it to open the demo.
- `META_API_KEY`, `META_API_BASE_URL`, `META_MODEL_*`, `AI_*` and `HOTEL_TIMEZONE` as in `.env.example`.
- `ENABLE_EXPERIMENTAL_COREPACK=1`, so the build uses the pnpm version from `packageManager`.

Migrations and the seed don't run on deploy. Run them from a laptop against Neon's direct (unpooled) connection string:

```sh
DATABASE_URL='postgres://…' pnpm db:migrate
DATABASE_URL='postgres://…' pnpm db:seed
```

Seed dates are relative to the day the seed runs, so re-seed shortly before a demo.

To try the function without deploying, run `pnpm build:vercel`, then serve `.vercel/output/functions/api.func/index.mjs` (its default export is a Node.js request listener) with `DATABASE_URL` set to a Postgres server.

## Scanning IDs with a phone

The ID scan link opens on a phone, which can't reach `localhost`. Start Orbit with `pnpm dev:lan` instead of `pnpm dev`: it runs the API and the web app like `pnpm dev`, with the web app also listening on the local network. Open Orbit on the computer by the network address Vite prints (e.g. `http://192.168.1.20:5173`), and scan the QR code with a phone on the same Wi-Fi. Without a phone, "Upload a photo instead" in the scan dialog sends a photo from the computer; the synthetic documents in `packages/ai/src/evals/id-documents/` work for trying it.
