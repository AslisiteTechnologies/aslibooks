export function assertMigrationTarget(databaseName: string | undefined, confirmation: string | undefined) {
  if (!databaseName) throw new Error('MONGODB_DB_NAME must be configured');
  if (confirmation !== databaseName)
    throw new Error(`Set ASLIBOOKS_MIGRATION_DATABASE to the exact target database name (${databaseName}) to confirm the migration target`);
}
