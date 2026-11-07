/** Require an explicit database name so a URI's default database is never selected accidentally. */
export function requireDatabaseName(value: string | undefined): string {
  const databaseName = value?.trim();
  if (!databaseName) throw new Error('MONGODB_DB_NAME is required to select the application database explicitly');
  return databaseName;
}
