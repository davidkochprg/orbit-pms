# Orbit PMS

An AI-native property management system for small hotels: anything you can click, you can also just ask for.

## Live demo

_Not deployed yet._

## The problem

_To be written._

## What it does

_To be written as features land._

## How it uses Meta's models

_To be written as AI features land._

## Architecture

The UI and the AI agent call the same deterministic domain functions. See [docs/architecture.md](docs/architecture.md).

## Evals

_Not built yet._

## Run it locally

Needs Node 24+ and pnpm. No database install: local dev uses an embedded Postgres ([PGlite](https://pglite.dev)).

```bash
pnpm i && pnpm db:migrate && pnpm db:seed && pnpm dev
```

Open http://localhost:5173. To turn on the AI features, copy `.env.example` to `.env` and fill in the Meta Model API variables. More in [docs/development.md](docs/development.md).

## How it was built

pnpm monorepo in strict TypeScript: Vite + React + Tailwind + shadcn/ui on the front end, Hono on Node for the API, Drizzle on Postgres, and the Vercel AI SDK pointed at the Meta Model API. Business rules live in a pure, unit-tested domain package shared by the UI and the agent.

## License

[MIT](LICENSE)
