// `pnpm demo`: check the setup, reset and seed the demo data, then start the API and the web app.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function fail(message) {
  console.error(`pnpm demo: ${message}`);
  process.exit(1);
}

const major = Number(process.versions.node.split('.')[0]);
if (major !== 24)
  fail(`Node 24 is required, found ${process.version}. Switch with nvm or fnm and retry.`);

if (existsSync('.env')) process.loadEnvFile('.env');
// Only checks that a key is there; never prints it.
if (!process.env.META_API_KEY?.trim()) {
  fail(
    'META_API_KEY is missing. Copy .env.example to .env and paste your key after META_API_KEY=.',
  );
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const step of ['db:reset', 'dev']) {
  const { status } = spawnSync(pnpm, [step], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (status !== 0) process.exit(status ?? 1);
}
