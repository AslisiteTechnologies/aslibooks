import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { configuredTrustedOrigins, requireTrustedOrigin } from './trustedOrigins.js';

describe('trusted origin guard', () => {
  it('trims a comma-separated web origin allowlist', () => {
    expect(configuredTrustedOrigins(' https://books.example , https://admin.example '))
      .toEqual(['https://books.example', 'https://admin.example']);
  });

  it('rejects untrusted unsafe browser requests before business handlers run', async () => {
    const app = express();
    let writes = 0;
    app.use('/api/organizations', requireTrustedOrigin(['https://books.example']));
    app.all('/api/organizations/:organizationId/contacts', (_req, res) => { writes += 1; res.sendStatus(204); });

    await request(app).post('/api/organizations/org-id/contacts').set('Origin', 'https://attacker.example').expect(403, { error: 'Untrusted request origin' });
    expect(writes).toBe(0);
    await request(app).put('/api/organizations/org-id/contacts').set('Origin', 'https://attacker.example').expect(403);
    await request(app).patch('/api/organizations/org-id/contacts').set('Origin', 'https://attacker.example').expect(403);
    await request(app).delete('/api/organizations/org-id/contacts').set('Origin', 'https://attacker.example').expect(403);
    await request(app).post('/api/organizations/org-id/contacts').set('Origin', 'null').expect(403);
    expect(writes).toBe(0);
  });

  it('allows exact trusted origins, non-mutating methods, and origin-less API clients', async () => {
    const app = express();
    let writes = 0;
    app.use('/api/organizations', requireTrustedOrigin(['https://books.example']));
    app.post('/api/organizations/:organizationId/contacts', (_req, res) => { writes += 1; res.sendStatus(204); });
    app.get('/api/organizations/:organizationId/contacts', (_req, res) => res.sendStatus(204));

    await request(app).post('/api/organizations/org-id/contacts').set('Origin', 'https://books.example').expect(204);
    await request(app).post('/api/organizations/org-id/contacts').expect(204);
    await request(app).get('/api/organizations/org-id/contacts').set('Origin', 'https://attacker.example').expect(204);
    expect(writes).toBe(2);
  });
});
