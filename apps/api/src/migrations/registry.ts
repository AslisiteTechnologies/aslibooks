import type { DataMigration } from './runner.js';

/** Register reviewed, forward-only, restart-safe data migrations here in ID order. */
export const migrations: readonly DataMigration[] = [];
