import { requireDatabaseName } from './databaseConfig.js';

export function assertIndexTarget(databaseName: string | undefined, confirmedDatabaseName: string | undefined): string {
  const target = requireDatabaseName(databaseName);
  if (!confirmedDatabaseName?.trim() || confirmedDatabaseName.trim() !== target) {
    throw new Error('ASLIBOOKS_INDEX_DATABASE must exactly match MONGODB_DB_NAME before ensuring indexes');
  }
  return target;
}
