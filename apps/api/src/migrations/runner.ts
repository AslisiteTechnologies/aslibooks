import type { Connection } from 'mongoose';

type Db = NonNullable<Connection['db']>;

export type DataMigration = {
  id: string;
  description: string;
  /** Keep this operation forward-only and safe to rerun if the process stops before its version is recorded. */
  up(database: Db): Promise<void>;
};

type AppliedMigration = import('mongoose').mongo.Document & { _id: string; description: string; appliedAt: Date };
const migrationId = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
export const migrationCollectionName = 'aslibooks_schema_migrations';

export async function applyMigrations(database: Db, migrations: readonly DataMigration[]) {
  validateRegistry(migrations);
  const ledger = database.collection<AppliedMigration>(migrationCollectionName);
  const recorded = await ledger.find({}, { projection: { _id: 1 } }).toArray();
  const known = new Set(migrations.map(migration => migration.id));
  const unknown = recorded.map(row => row._id).filter(id => !known.has(id));
  if (unknown.length) throw new Error(`Database has migration versions absent from this release: ${unknown.join(', ')}`);
  await ledger.createIndex({ appliedAt: 1 });

  const applied = new Set(recorded.map(row => row._id));
  const newlyApplied: string[] = [];
  for (const migration of [...migrations].sort((left, right) => left.id.localeCompare(right.id))) {
    if (applied.has(migration.id)) continue;
    await migration.up(database);
    await ledger.insertOne({ _id: migration.id, description: migration.description, appliedAt: new Date() });
    applied.add(migration.id);
    newlyApplied.push(migration.id);
  }
  return newlyApplied;
}

function validateRegistry(migrations: readonly DataMigration[]) {
  const seen = new Set<string>();
  for (const migration of migrations) {
    if (!migrationId.test(migration.id)) throw new Error(`Invalid migration ID: ${migration.id}`);
    const date = migration.id.slice(0, 10);
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date)
      throw new Error(`Invalid migration date: ${migration.id}`);
    if (!migration.description.trim()) throw new Error(`Migration ${migration.id} needs a description`);
    if (seen.has(migration.id)) throw new Error(`Duplicate migration ID: ${migration.id}`);
    seen.add(migration.id);
  }
}
