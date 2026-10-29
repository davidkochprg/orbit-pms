# 14. Vercel Build Output and a demo access code

## Context

The demo has to run at a public URL for the judges, on Vercel with Neon Postgres ([ADR 0005](0005-pglite-for-local-development.md)). The repo is a pnpm monorepo whose packages are consumed as TypeScript source, and the API is a Hono app that streams agent answers. Until judging starts the deployment must not be usable by strangers: every agent, inbox, voice and ID scan call spends Meta API credits. Vercel's own password protection is a paid add-on, and Vercel Authentication needs a Vercel account on the team, which judges won't have.

## Decision

- **One Vercel project, Build Output API.** `pnpm build:vercel` writes `.vercel/output`: the Vite build as static files and the whole API bundled by esbuild into one Node.js function (`functions/api.func`) behind `/api/*` and `/health`. Bundling sidesteps workspace TypeScript resolution in Vercel's Node builder, and one function means one warm instance and one database pool. PGlite is replaced by a stub in the bundle; production always uses `postgres://`.
- **No server rendering, no ISR.** The web app is a single-page app; hashed assets are cached immutably, `index.html` revalidates, API answers are `private, no-store`.
- **A demo access code in the API**, not at the edge. With `DEMO_ACCESS_CODE` set, every `/api/*` call needs an HttpOnly cookie holding an HMAC of a fixed string keyed by the code, set by `POST /api/access`. The web app asks for the code before loading anything. The phone ID scan routes stay open, since an unguessable scan ID created at the desk is already their key. Ten wrong codes from one address lock it out for 15 minutes.

## Consequences

- The static app shell is public; the hotel's data and every AI call are not. That is what protects the credits, at no cost.
- Opening the demo to judges means sharing the code, or unsetting `DEMO_ACCESS_CODE` and redeploying. Changing the code signs every browser out.
- Migrations and the seed run by hand against Neon, not on deploy.
- The in-memory demo limits (per-IP rate, daily tokens) are per function instance, so several instances allow somewhat more; the monthly dollar cap is read from the database and holds across all of them.
