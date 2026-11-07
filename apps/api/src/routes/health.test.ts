import express from 'express';
import request from 'supertest';
import { describe, it } from 'vitest';
import { healthRouter } from './health.js';

describe('health probes', () => {
  it('keeps liveness independent from readiness and reports database outages without details', async () => {
    const app = express();
    app.use('/health', healthRouter(() => false));

    await request(app).get('/health').expect(200, { status: 'ok', service: 'aslibooks-api' });
    await request(app).get('/health/ready').expect(503, { status: 'not_ready', service: 'aslibooks-api' });
  });

  it('reports ready only after the database connection is established', async () => {
    const app = express();
    app.use('/health', healthRouter(() => true));

    await request(app).get('/health/ready').expect(200, { status: 'ready', service: 'aslibooks-api' });
  });
});
