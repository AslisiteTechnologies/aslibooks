import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { apiResponseHeaders } from './responseHeaders.js';

describe('API response security headers', () => {
  it('marks API and not-found responses non-cacheable and blocks sniffing, framing, and active content', async () => {
    const app = express();
    app.use(apiResponseHeaders);
    app.get('/private', (_request, response) => response.json({ ledger: 'private' }));
    const expected = {
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), geolocation=(), microphone=()',
      'content-security-policy': "default-src 'none'",
    };
    for (const path of ['/private', '/missing']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(path === '/private' ? 200 : 404);
      for (const [name, value] of Object.entries(expected)) expect(response.headers[name]).toBe(value);
    }
  });
});
