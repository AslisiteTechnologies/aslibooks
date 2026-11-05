import type { RequestHandler } from 'express';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function configuredTrustedOrigins(value = process.env.WEB_ORIGIN): string[] {
  return (value ?? 'http://localhost:5173').split(',').map(origin => origin.trim()).filter(Boolean);
}

/** Protect cookie-authenticated business mutations from cross-origin browser requests. */
export function requireTrustedOrigin(origins: readonly string[]): RequestHandler {
  const allowlist = new Set(origins);
  return (req, res, next) => {
    if (!unsafeMethods.has(req.method)) { next(); return; }
    const origin = req.get('Origin');
    // Non-browser API clients may omit Origin. Browser requests to unsafe methods include it.
    if (origin === undefined || allowlist.has(origin)) { next(); return; }
    res.status(403).json({ error: 'Untrusted request origin' });
  };
}
