import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureAuthRateLimitIndexes, MongoAuthRateLimitStore } from './authRateLimit.js';

const uri = process.env.MONGODB_TEST_URI;
const dbName = process.env.MONGODB_TEST_DB_NAME;
const enabled = !!uri && !!dbName && /^aslibooks_test_[a-z0-9_]+$/i.test(dbName);

describe.skipIf(!enabled)('shared MongoDB authentication rate limit store', () => {
  const prefix = `aslibooks:test:${new mongoose.Types.ObjectId()}:`;
  const first = new MongoAuthRateLimitStore({ windowMs: 60_000, prefix, hashSecret: 'integration-test-secret' });
  const second = new MongoAuthRateLimitStore({ windowMs: 60_000, prefix, hashSecret: 'integration-test-secret' });

  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName });
    await first.initialize();
  });

  afterAll(async () => {
    await first.resetAll();
    await mongoose.disconnect();
  });

  it('shares fixed-window counters between independent store instances and isolates keys', async () => {
    const key = '203.0.113.10';
    const firstHit = await first.increment(key);
    const observed = await second.get(key);
    expect(firstHit.totalHits).toBe(1);
    expect(observed?.totalHits).toBe(1);

    const secondHit = await second.increment(key);
    expect(secondHit.totalHits).toBe(2);
    expect((await first.get(key))?.totalHits).toBe(2);
    expect(secondHit.resetTime).toEqual(firstHit.resetTime);
    expect((await first.get('203.0.113.11'))?.totalHits).toBeUndefined();

    await second.resetKey(key);
    expect(await first.get(key)).toBeUndefined();
  });

  it('prepares TTL indexes for both runtime rate-limit collections', async () => {
    const collectionNames = [`auth_rate_index_test_${new mongoose.Types.ObjectId()}`, `ai_rate_index_test_${new mongoose.Types.ObjectId()}`];
    await ensureAuthRateLimitIndexes(collectionNames);
    for (const name of collectionNames) {
      const indexes = await mongoose.connection.db!.collection(name).listIndexes().toArray();
      expect(indexes).toContainEqual(expect.objectContaining({
        name: 'auth_rate_limit_expiry', key: { expiresAt: 1 }, expireAfterSeconds: 0,
      }));
      await mongoose.connection.db!.dropCollection(name);
    }
  });
});
