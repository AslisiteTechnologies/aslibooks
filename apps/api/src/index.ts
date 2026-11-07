import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { connectDatabase, disconnectDatabase } from './db.js';
import { createAuth, closeAuthConnection } from './auth.js';
import { organizationRouter } from './routes/organizations.js';
import { emailDeliveryEnabled } from './email.js';
import { createAuthRateLimiter, createMongoAuthRateLimitStore } from './security/authRateLimit.js';
import mongoose from 'mongoose';
import { healthRouter } from './routes/health.js';
import { configuredTrustedOrigins, requireTrustedOrigin } from './security/trustedOrigins.js';
import { apiResponseHeaders } from './security/responseHeaders.js';
import { logSafeError } from './security/safeLogger.js';

async function start() {
  const auth = await createAuth();
  await connectDatabase();
  const authRateLimitStore = createMongoAuthRateLimitStore();
  await authRateLimitStore.initialize();

  const app = express();
  app.disable('x-powered-by');
  app.use(apiResponseHeaders);
  const origins = configuredTrustedOrigins();
  app.use(cors({ origin: origins, credentials: true }));
  app.get('/api/public/config', (_req, res) => res.json({ emailVerificationRequired: emailDeliveryEnabled() }));
  app.use('/api/auth', createAuthRateLimiter({ store: authRateLimitStore }));
  app.all('/api/auth/*splat', toNodeHandler(auth));
  app.use(express.json({ limit: '100kb' }));
  app.use('/health', healthRouter(() => mongoose.connection.readyState === 1));
  app.use('/api/organizations', requireTrustedOrigin(origins), organizationRouter(async (headers) => {
    const session = await auth.api.getSession({ headers });
    return session?.user ? { id: session.user.id } : null;
  }));

  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    logSafeError('api_request_failed', error);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(handleError);

  const port = Number(process.env.PORT ?? 4000);
  const server = app.listen(port, () => console.info(`Aslibooks API listening on ${port}`));
  async function shutdown() {
    server.close();
    await disconnectDatabase();
    await closeAuthConnection();
  }
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}

start().catch((error: unknown) => {
  logSafeError('api_startup_failed', error);
  process.exitCode = 1;
});
