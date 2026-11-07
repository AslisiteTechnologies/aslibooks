import type { RequestHandler } from 'express';

/** Applies safe defaults to API responses, including authentication and financial data. */
export const apiResponseHeaders: RequestHandler = (_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Content-Security-Policy', "default-src 'none'");
  next();
};
