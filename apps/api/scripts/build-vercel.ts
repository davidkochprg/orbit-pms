/**
 * Builds Orbit for Vercel with the Build Output API (vercel.com/docs/build-output-api): the web
 * app as static files on the CDN, and the whole API bundled into one Node.js function behind
 * `/api/*` and `/health`. Run `pnpm --filter @orbit/web build` first.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, type Plugin } from 'esbuild';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const output = path.join(repoRoot, '.vercel/output');
const webDist = path.join(repoRoot, 'apps/web/dist');
const functionDir = path.join(output, 'functions/api.func');

/** PGlite is the local database only; production talks to Postgres, so leave its WASM out. */
const withoutPglite: Plugin = {
  name: 'without-pglite',
  setup(b) {
    b.onResolve({ filter: /^@electric-sql\/pglite$/ }, () => ({
      path: 'pglite',
      namespace: 'stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `export const types = {};
export class PGlite {
  constructor() { throw new Error('PGlite is not in the Vercel build: set DATABASE_URL to postgres://…'); }
}`,
    }));
  },
};

await rm(output, { recursive: true, force: true });
await mkdir(functionDir, { recursive: true });

const result = await build({
  entryPoints: [path.join(repoRoot, 'apps/api/src/vercel.ts')],
  outfile: path.join(functionDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  plugins: [withoutPglite],
  // Some bundled CommonJS dependencies still call require() for Node built-ins.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});

await writeFile(
  path.join(functionDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs24.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      // The agent streams its answer as server-sent events.
      supportsResponseStreaming: true,
      maxDuration: 120,
    },
    null,
    2,
  ),
);

await cp(webDist, path.join(output, 'static'), { recursive: true });

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  // A demo with synthetic data: keep it out of search results.
  'x-robots-tag': 'noindex',
};

await writeFile(
  path.join(output, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/.*$', headers: securityHeaders, continue: true },
        // Vite names built assets by content hash, so they never change once deployed.
        {
          src: '^/assets/.*$',
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
          continue: true,
        },
        { src: '^/(?:api(?:/.*)?|health)$', dest: '/api' },
        { handle: 'filesystem' },
        // An asset from an older deployment: a real 404, not the app's HTML.
        { src: '^/assets/.*$', status: 404 },
        // Everything else is a client-side route of the single-page app.
        { src: '^/.*$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
console.log(
  `vercel output: ${path.relative(repoRoot, output)} (api ${(bytes / 1e6).toFixed(1)} MB)`,
);
