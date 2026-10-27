import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireLock, DatabaseLockedError } from './lock';

const dirs: string[] = [];
const lockPath = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orbit-lock-'));
  dirs.push(dir);
  return path.join(dir, 'db.lock');
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('acquireLock', () => {
  it('writes our PID and removes the file on release', () => {
    const file = lockPath();
    const release = acquireLock(file);
    expect(readFileSync(file, 'utf8')).toBe(String(process.pid));
    release();
    expect(existsSync(file)).toBe(false);
  });

  it('refuses a lock held by a live process', () => {
    const file = lockPath();
    // The parent process is alive for the duration of the test.
    writeFileSync(file, String(process.ppid));
    expect(() => acquireLock(file)).toThrow(DatabaseLockedError);
    expect(readFileSync(file, 'utf8')).toBe(String(process.ppid));
  });

  it('takes over a lock left by a dead process', () => {
    const file = lockPath();
    writeFileSync(file, '999999999');
    const release = acquireLock(file);
    expect(readFileSync(file, 'utf8')).toBe(String(process.pid));
    release();
  });
});
