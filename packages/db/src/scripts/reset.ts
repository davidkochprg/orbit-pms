import { rmSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOCAL_DATABASE_URL } from '../client';
import { repoRoot } from '../paths';

// Deletes the local PGlite data directory. Refuses to touch a real Postgres database.
const url = process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
if (/^postgres(ql)?:\/\//.test(url)) {
  console.error(
    'db:reset only deletes a local PGlite database. Use db:seed to reset Postgres data.',
  );
  process.exit(1);
}
const dir = path.resolve(repoRoot, url.replace(/^file:/, ''));
if (!dir.startsWith(repoRoot + path.sep)) {
  console.error(`Refusing to delete ${dir}: it is outside the repository.`);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
console.log(`Deleted ${path.relative(repoRoot, dir)}.`);
