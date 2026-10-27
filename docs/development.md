# Development

## Local setup

_Filled in with the scaffold._

## Environment variables

_Filled in with the scaffold._

## Scripts

_Filled in with the scaffold._

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
