import { readFileSync, rmSync, writeFileSync } from 'node:fs';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export class DatabaseLockedError extends Error {
  constructor(
    readonly lockFile: string,
    readonly pid: number,
  ) {
    super(
      `The local database is in use by process ${pid}. PGlite allows one process at a time: ` +
        `stop it (e.g. pnpm dev) and try again. Lock file: ${lockFile}`,
    );
    this.name = 'DatabaseLockedError';
  }
}

/**
 * Takes an exclusive lock on a PGlite data directory. PGlite has no locking of its own, and two
 * processes writing to one directory corrupt it. A lock left by a dead process is taken over.
 */
export function acquireLock(lockFile: string): () => void {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      return () => {
        try {
          if (readFileSync(lockFile, 'utf8') === String(process.pid)) rmSync(lockFile);
        } catch {
          // Already gone.
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const pid = Number(readFileSync(lockFile, 'utf8'));
      if (Number.isInteger(pid) && pid > 0 && isAlive(pid))
        throw new DatabaseLockedError(lockFile, pid);
      rmSync(lockFile, { force: true });
    }
  }
  throw new Error(`Could not lock ${lockFile}`);
}
