import path from 'node:path';

/** Repository root, so relative database paths mean the same thing from every package. */
export const repoRoot = path.resolve(import.meta.dirname, '../../..');
export const migrationsFolder = path.resolve(import.meta.dirname, '../drizzle');
