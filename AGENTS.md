# AGENTS.md

Rules for any coding agent working in this repository. Read this before making changes.

## Project
Orbit PMS is an AI-native property management system (PMS) for small hotels, built for the Meta Global AI Developer Hackathon. The UI and an AI agent operate the hotel through the **same** domain functions: anything you can click, you can also ask for.

Docs: `docs/architecture.md`, `docs/domain.md`, `docs/ai.md`, `docs/api.md`, `docs/development.md`, `docs/decisions/`.

## Stack
pnpm workspaces · TypeScript (strict) · Vite + React + Tailwind + shadcn/ui · React Router · TanStack Query/Table · react-hook-form + zod · dnd-kit · date-fns · Node + Hono · Postgres + Drizzle · Vercel AI SDK with an OpenAI-compatible provider pointed at the Meta Model API · Vitest · ESLint + Prettier.

Don't add or swap major dependencies without a clear reason stated in the commit body.

## Layout
```
apps/web          React app (UI only, no business logic)
apps/api          Hono server: thin routes, SSE for the agent
packages/domain   Pure TS business logic: availability, pricing, bookings, housekeeping
packages/db       Drizzle schema, migrations, seed, repository implementations
packages/ai       Meta provider adapter, zod-typed tools, prompts, evals
packages/shared   zod schemas and types shared across packages
docs/             Documentation and ADRs
```

## Commands
```
pnpm dev            # web + api in watch mode
pnpm build
pnpm typecheck
pnpm lint
pnpm test           # Vitest
pnpm db:generate    # Drizzle migrations from schema
pnpm db:migrate
pnpm db:seed        # synthetic demo data, dates relative to today
pnpm eval           # AI extraction evals, prints pass rate
```

## Architecture rules
- `UI → api routes → packages/domain ← packages/ai tools ← agent`. UI actions and agent tools call the same domain functions.
- **No business logic** in React components, Hono routes or prompts.
- `packages/domain` is pure: no network, no DB driver, no env access. I/O goes through repository interfaces implemented in `packages/db`.
- Validate every external input (HTTP bodies, tool arguments, LLM output) with zod schemas from `packages/shared`.

## AI rules
- Runtime AI uses **Meta models only**, via the Meta Model API. Never call OpenAI, Anthropic or Google models from the app.
- Model IDs, API base URL and keys come from env vars. Never hardcode them.
- The API key is server-side only. Never expose it to the web bundle (no `VITE_` env vars for secrets).
- The LLM never computes prices or availability. It calls `quote` and `checkAvailability` and repeats their results.
- Mutating tools return a `PendingAction`. They execute only after explicit user confirmation, and every execution is written to the audit log.
- Prompts live in `packages/ai/prompts/`, with hotel context injected from config.
- When you change extraction or tool behavior, run `pnpm eval` and note the pass rate in the commit body.

## Domain conventions
- Stays are half-open date ranges `[checkIn, checkOut)`. Dates are stored as `YYYY-MM-DD`. Hotel timezone is `Europe/Prague`.
- Money is integer whole CZK. No floats for prices.
- `quote()` returns a full line-item breakdown that the UI and agent display verbatim.
- Pricing config values marked `TODO(David)` are placeholders. Don't replace them with guessed numbers.

## Data and privacy
- No real guest names, emails, phone numbers or other PII anywhere: code, seed data, fixtures, tests, docs or screenshots. Use clearly synthetic data.
- No secrets in the repo. `.env` is gitignored; `.env.example` documents every variable.

## Code style
- TypeScript strict. No `any` in `packages/domain`, `packages/ai` or `packages/shared`.
- Small, focused modules. Named exports. Co-locate tests as `*.test.ts`.
- UI uses shadcn components and Tailwind tokens. One accent color. Dark mode must work.
- Interface text is English. Guest-facing drafts use the guest's language.

## Testing
- Every domain function has unit tests, including edge cases: overlapping stays, same-day turnover, season boundaries, child age tiers, long-stay thresholds.
- Fix failing tests, don't skip or delete them.
- `pnpm typecheck && pnpm lint && pnpm test` must pass before committing code.

## Git
- **Conventional Commits:** `type(scope): summary`, imperative, lowercase, no trailing period, ≤ 72 chars.
  - Types: `feat` `fix` `refactor` `perf` `test` `docs` `style` `build` `ci` `chore`
  - Scopes: `web` `api` `domain` `db` `ai` `shared` `docs` `repo` `deploy`
  - Example: `feat(domain): add long-stay discount to quote`
- One logical change per commit. Commitlint and husky enforce the format.
- **No AI attribution:** no `Co-Authored-By` trailers for AI tools, no "Generated with …" lines, no session links, in commits or PR descriptions. The commit-msg hook rejects them.
- Never stage ignored or excluded files. Never use `git add -f`. Never bypass hooks with `--no-verify`.

## Documentation
- Update docs in the same commit as the behavior they describe: tools → `docs/ai.md`, endpoints → `docs/api.md`, pricing/availability → `docs/domain.md`, setup/env → `docs/development.md`.
- Record real architectural decisions as short ADRs in `docs/decisions/` (Context, Decision, Consequences).
- Docs describe what exists, not plans. Diagrams in Mermaid.

## Definition of done
- Typecheck, lint and tests pass.
- Behavior covered by tests where it lives in `packages/domain` or `packages/ai`.
- Docs updated.
- Works in the running app (`pnpm dev`), in light and dark mode.
- Committed with a Conventional Commit message and no AI attribution.
