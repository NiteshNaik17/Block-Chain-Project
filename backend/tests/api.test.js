import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '../app.js';

/**
 * API foundation tests.
 * These run without a database connection, so the honest database state is
 * "disconnected" - the endpoints must report that instead of faking "connected".
 */
describe('Phase 3 - API foundation', () => {
  const HEALTH_KEYS = [
    'application',
    'service',
    'version',
    'environment',
    'status',
    'degraded',
    'database',
    'databaseConnected',
    'databaseName',
    'blockchain',
    'timestamp',
  ];

  it('GET / describes the running service', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'MediConsent API', status: 'running' });
  });

  it('GET /api/health returns the required health fields', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([...HEALTH_KEYS].sort());
    expect(res.body.application).toBe('MediConsent');
    expect(res.body.service).toBe('mediconsent-api');
    expect(res.body.status).toBe('ok');
    expect(res.body.databaseName).toBe('mediconsent');
    expect(typeof res.body.databaseConnected).toBe('boolean');
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it('GET /api/v1/health returns the same health information', async () => {
    const [unversioned, versioned] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/v1/health'),
    ]);

    expect(versioned.status).toBe(200);
    expect(Object.keys(versioned.body).sort()).toEqual([...HEALTH_KEYS].sort());
    expect(versioned.body.application).toBe(unversioned.body.application);
    expect(versioned.body.service).toBe(unversioned.body.service);
    expect(versioned.body.database).toBe(unversioned.body.database);
  });

  it('reports the real database state rather than a hardcoded "connected"', async () => {
    const res = await request(app).get('/api/v1/health');

    // No connection is established in this suite.
    expect(['disconnected', 'connecting']).toContain(res.body.database);
    expect(res.body.databaseConnected).toBe(false);
    expect(res.body.degraded).toBe(true);
  });

  it('exposes the blockchain configuration without leaking secrets', async () => {
    const res = await request(app).get('/api/health');

    expect(res.body.blockchain).toEqual({
      rpcUrl: expect.any(String),
      chainId: 31337,
      contractConfigured: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/jwtSecret|masterEncryptionKey|passwordHash/i);
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('does not expose unauthenticated CRUD endpoints for sensitive data', async () => {
    const protectedPaths = [
      '/api/v1/users',
      '/api/v1/records',
      '/api/v1/medical-records',
      '/api/v1/consents',
      '/api/v1/access-requests',
    ];

    for (const path of protectedPaths) {
      const res = await request(app).get(path);
      expect(res.status, `${path} must not be implemented in Phase 3`).toBe(404);
    }

    const post = await request(app).post('/api/v1/records').send({ recordTitle: 'x' });
    expect(post.status).toBe(404);
  });
});
