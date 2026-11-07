import type { RequestHandler } from 'express';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function configuredTrustedOrigins(value = process.env.WEB_ORIGIN, environment = process.env.NODE_ENV): string[] {
  const configured = value?.trim();
  if (!configured) {
    if (environment === 'production') throw new Error('WEB_ORIGIN must be configured in production');
    return ['http://localhost:5173'];
  }

  const origins = configured.split(',').map(value => {
    const input = value.trim();
    let parsed: URL;
    try { parsed = new URL(input); } catch { throw new Error('WEB_ORIGIN must contain valid absolute origins'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin === 'null') {
      throw new Error('WEB_ORIGIN entries must be origins without credentials, paths, queries, or fragments');
    }
    if (environment === 'production' && parsed.protocol !== 'https:') {
      throw new Error('WEB_ORIGIN entries must use HTTPS in production');
    }
    return parsed.origin;
  });
  return [...new Set(origins)];
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
