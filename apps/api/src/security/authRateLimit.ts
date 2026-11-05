import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

type AuthRateLimitOptions = { windowMs?: number; limit?: number };

/**
 * Bounds password and account-management mutations. The built-in store is process-local;
 * production deployments with multiple API instances must configure a shared store.
 */
export function createAuthRateLimiter(options: AuthRateLimitOptions = {}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? 15 * 60 * 1000,
    limit: options.limit ?? 20,
    skip: request => request.method !== 'POST',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: 'Too many authentication requests. Try again later.' }),
  });
}
