import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';
import { getEmailProviderConfig, sendTransactionalEmail } from './email.js';
import { configuredTrustedOrigins } from './security/trustedOrigins.js';
import { sendAuthEmailInBackground } from './authEmail.js';
import { requireDatabaseName } from './databaseConfig.js';

let client: MongoClient | undefined;

/** Initialize only after verifying environment configuration. */
export async function createAuth() {
  const uri = process.env.MONGODB_URI;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  const databaseName = requireDatabaseName(process.env.MONGODB_DB_NAME);
  if (!uri || !secret || !baseURL) throw new Error('MONGODB_URI, BETTER_AUTH_SECRET and BETTER_AUTH_URL are required');
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
  const emailProvider = getEmailProviderConfig();
  client = new MongoClient(uri);
  await client.connect();
  const database = client.db(databaseName);
  return betterAuth({
    database: mongodbAdapter(database),
    secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
      ...(emailProvider ? {
        requireEmailVerification: true,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
          sendAuthEmailInBackground(() => sendTransactionalEmail({ to: user.email, subject: 'Reset your Aslibooks password', text: 'Use this single-use link to reset your password: ' + url }, emailProvider));
        },
      } : {}),
    },
    ...(emailProvider ? {
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
          sendAuthEmailInBackground(() => sendTransactionalEmail({ to: user.email, subject: 'Verify your Aslibooks email', text: 'Verify your email address to finish setting up your account: ' + url }, emailProvider));
        },
      },
    } : {}),
    trustedOrigins: configuredTrustedOrigins(),
  });
}

export async function closeAuthConnection() {
  if (client) await client.close();
  client = undefined;
}
