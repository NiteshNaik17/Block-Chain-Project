import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('Phase 1 - backend scaffolding', () => {
  it('GET /api/health returns a healthy payload', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('mediconsent-api');
    expect(res.body).toHaveProperty('database');
    expect(res.body.blockchain.chainId).toBe(31337);
  });

  it('GET /api/health reports the real database state (not hardcoded)', async () => {
    const res = await request(app).get('/api/health');

    // No MONGODB_URI is required for this test suite, so the honest
    // state is "disconnected" rather than a faked "connected".
    expect(['disconnected', 'connecting']).toContain(res.body.database);
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
