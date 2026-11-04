import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Parses `ps -o etime` output, `[[dd-]hh:]mm:ss`, into seconds. */
export function parseElapsed(etime: string): number | undefined {
  const match = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
  if (!match) return undefined;
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

/** When a process started, in epoch ms, or undefined when the OS won't say. */
function processStartedAt(pid: number): number | undefined {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `([DateTimeOffset](Get-Process -Id ${pid}).StartTime).ToUnixTimeMilliseconds()`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true },
      );
      const ms = Number(out.trim());
      return Number.isFinite(ms) && ms > 0 ? ms : undefined;
    }
    const out = execFileSync('ps', ['-o', 'etime=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const elapsed = parseElapsed(out);
    return elapsed === undefined ? undefined : Date.now() - elapsed * 1000;
  } catch {
    return undefined;
  }
}

/**
 * Whether the lock's PID still belongs to the process that wrote it. The OS reuses PIDs, so a
 * killed dev server's lock can name an unrelated process; one that started after the lock was
 * written can't be its owner.
 */
function isHeldBy(lockFile: string, pid: number): boolean {
  if (!isAlive(pid)) return false;
  const startedAt = processStartedAt(pid);
  if (startedAt === undefined) return true;
  // ps reports whole seconds; allow for that rounding.
  return startedAt <= statSync(lockFile).mtimeMs + 2000;
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
 * processes writing to one directory corrupt it. A lock left by a dead process, or whose PID has
 * since been reused, is taken over.
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
      if (Number.isInteger(pid) && pid > 0 && isHeldBy(lockFile, pid))
        throw new DatabaseLockedError(lockFile, pid);
      rmSync(lockFile, { force: true });
    }
  }
  throw new Error(`Could not lock ${lockFile}`);
}
