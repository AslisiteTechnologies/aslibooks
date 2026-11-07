import { MongoClient } from 'mongodb';

const databaseName = process.env.MONGODB_DB_NAME;
const uri = process.env.MONGODB_URI;
const email = process.argv[2]?.trim().toLowerCase();

if (databaseName !== 'aslibooks_e2e' || !uri || !email || !/^[^\s@]+@example\.com$/.test(email)) {
  process.stderr.write('Synthetic E2E verification requires the isolated aslibooks_e2e database and an example.com test account.\n');
  process.exitCode = 1;
} else {
  let parsed: URL | undefined;
  try { parsed = new URL(uri); } catch { /* Handled by the fixed failure below. */ }
  if (!parsed || parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    || parsed.username || parsed.password) {
    process.stderr.write('Synthetic E2E verification only accepts an unauthenticated loopback MongoDB URI.\n');
    process.exitCode = 1;
  } else {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.connect();
      const result = await client.db(databaseName).collection('user').updateOne({ email }, { $set: { emailVerified: true } });
      if (result.matchedCount !== 1) throw new Error('Synthetic test account was not found');
      process.stdout.write('Synthetic E2E account verification completed.\n');
    } catch {
      process.stderr.write('Synthetic E2E account verification failed.\n');
      process.exitCode = 1;
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
