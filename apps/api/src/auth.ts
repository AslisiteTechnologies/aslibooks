import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';

let client: MongoClient | undefined;

/** Initialize only after verifying environment configuration. */
export async function createAuth() {
  const uri = process.env.MONGODB_URI;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!uri || !secret || !baseURL) throw new Error('MONGODB_URI, BETTER_AUTH_SECRET and BETTER_AUTH_URL are required');
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
  client = new MongoClient(uri);
  await client.connect();
  const database = client.db(process.env.MONGODB_DB_NAME || 'aslibooks');
  return betterAuth({
    database: mongodbAdapter(database),
    secret,
    baseURL,
    emailAndPassword: { enabled: true },
    trustedOrigins: (process.env.WEB_ORIGIN || 'http://localhost:5173').split(','),
  });
}

export async function closeAuthConnection() {
  if (client) await client.close();
  client = undefined;
}
