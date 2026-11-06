import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './db.js';
import { assertMigrationTarget } from './migrations/config.js';
import { migrations } from './migrations/registry.js';
import { applyMigrations } from './migrations/runner.js';

async function run() {
  const databaseName = process.env.MONGODB_DB_NAME;
  assertMigrationTarget(databaseName, process.env.ASLIBOOKS_MIGRATION_DATABASE);

  await connectDatabase();
  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB database connection is unavailable');
    const applied = await applyMigrations(database, migrations);
    console.info(applied.length
      ? `Applied ${applied.length} data migration(s): ${applied.join(', ')}`
      : `No pending data migrations for database ${databaseName}`);
  } finally {
    await disconnectDatabase();
  }
}

run().catch(error => {
  console.error('Data migration run failed. Inspect the target database before retrying.', error);
  process.exitCode = 1;
});
