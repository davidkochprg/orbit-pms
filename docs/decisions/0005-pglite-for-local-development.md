# 5. PGlite for local development

## Context

Production runs on Postgres (Neon via Vercel). Contributors and judges should be able to clone the repo and run it without installing Postgres or Docker. A SQLite fallback would need a second Drizzle schema and migration set that could drift from the Postgres one.

## Decision

`packages/db` picks the driver from `DATABASE_URL`: a `postgres://` URL uses postgres.js against a real server; anything else (default `file:./.data/orbit`) uses PGlite, an embedded Postgres compiled to WASM, with its data in `.data/` at the repo root. Both use the same `pg-core` schema and the same migrations.

## Consequences

- `pnpm db:migrate && pnpm db:seed` works on a fresh clone with nothing but Node.
- Local behavior matches production SQL, including enums, `jsonb` and check constraints.
- A PGlite data directory can only be opened by one process; concurrent writers corrupt it. `createDb` takes a PID lock file next to the directory, so a second process fails fast instead. Stop `pnpm dev` before running `pnpm db:migrate` or `pnpm db:seed`.
