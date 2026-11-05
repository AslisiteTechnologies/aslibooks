import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthRateLimiter } from './authRateLimit.js';

describe('authentication rate limit', () => {
  it('limits POST requests per client and preserves GET session checks', async () => {
    const app = express();
    app.use('/api/auth', createAuthRateLimiter({ windowMs: 60_000, limit: 2 }));
    app.all('/api/auth/*splat', (_request, response) => response.status(200).json({ ok: true }));

    await request(app).get('/api/auth/get-session').expect(200);
    await request(app).post('/api/auth/sign-in/email').expect(200);
    await request(app).post('/api/auth/sign-in/email').expect(200);
    const limited = await request(app).post('/api/auth/sign-in/email').expect(429);
    expect(limited.body.error).toContain('Too many authentication requests');
    expect(limited.headers['ratelimit-limit']).toBe('2');
  });
});
