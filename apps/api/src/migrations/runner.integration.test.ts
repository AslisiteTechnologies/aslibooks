import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, migrationCollectionName, type DataMigration } from './runner.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('versioned data migrations', () => {
  beforeAll(async () => { await mongoose.connect(uri!, { dbName: dbName! }); });

  it('orders migrations, resumes a partial idempotent migration, and records each version once', async () => {
    const database = mongoose.connection.db!;
    const fixtureId = new mongoose.Types.ObjectId();
    const fixture = database.collection('migration_runner_fixture');
    await fixture.deleteMany({});
    await database.collection(migrationCollectionName).deleteMany({});
    let failAfterWrite = true;
    const first: DataMigration = {
      id: '2026-11-01-add-fixture-marker', description: 'Add a synthetic migration fixture marker',
      up: async db => { await db.collection('migration_runner_fixture').updateOne({ _id: fixtureId }, { $set: { normalized: true } }, { upsert: true }); },
    };
    const interrupted: DataMigration = {
      id: '2026-11-02-set-fixture-label', description: 'Set a synthetic migration fixture label',
      up: async db => {
        await db.collection('migration_runner_fixture').updateOne({ _id: fixtureId }, { $set: { label: 'ready' } });
        if (failAfterWrite) { failAfterWrite = false; throw new Error('simulated stop after idempotent write'); }
      },
    };

    await expect(applyMigrations(database, [interrupted, first])).rejects.toThrow('simulated stop');
    const resumed = await applyMigrations(database, [interrupted, first]);
    expect(resumed).toEqual([interrupted.id]);
    expect(await fixture.findOne({ _id: fixtureId })).toMatchObject({ normalized: true, label: 'ready' });
    expect((await database.collection(migrationCollectionName).find().sort({ _id: 1 }).toArray()).map(row => row._id))
      .toEqual([first.id, interrupted.id]);
    expect(await applyMigrations(database, [first, interrupted])).toEqual([]);
    expect(await database.collection(migrationCollectionName).countDocuments({})).toBe(2);
  });

  it('rejects malformed and duplicate migration IDs before running any migration', async () => {
    const database = mongoose.connection.db!;
    const run = async () => undefined;
    await expect(applyMigrations(database, [{ id: 'bad-id', description: 'Bad version', up: run }])).rejects.toThrow('Invalid migration ID');
    await expect(applyMigrations(database, [{ id: '2026-13-01-invalid-date', description: 'Invalid date', up: run }])).rejects.toThrow('Invalid migration date');
    const duplicate = { id: '2026-11-03-duplicate', description: 'Duplicate', up: run };
    await expect(applyMigrations(database, [duplicate, duplicate])).rejects.toThrow('Duplicate migration ID');
  });

  it('refuses database versions absent from this release registry', async () => {
    const database = mongoose.connection.db!;
    await database.collection(migrationCollectionName).deleteMany({});
    await database.command({ insert: migrationCollectionName, documents: [{ _id: '2026-10-01-retired-migration', description: 'historical', appliedAt: new Date() }] });
    await expect(applyMigrations(database, [])).rejects.toThrow('absent from this release');
  });

  afterAll(async () => {
    if (!enabled) return;
    await mongoose.connection.db!.collection('migration_runner_fixture').drop().catch(() => undefined);
    await mongoose.connection.db!.collection(migrationCollectionName).drop().catch(() => undefined);
    await mongoose.disconnect();
  });
});
