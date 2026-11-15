import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import app from '../app.js';
import { connectDB, dbState, isDbConnected } from '../config/db.js';

/**
 * Degraded-mode behaviour.
 *
 * No database is ever reachable in this suite. The point is to prove that the
 * API starts, keeps serving, and reports the outage honestly instead of
 * crashing or pretending to be connected.
 *
 * NOTE: an in-memory MongoDB server may not be used here because these tests
 * specifically require the *absence* of a reachable database.
 */
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('Phase 3 - MongoDB unavailability is handled safely', () => {
  it('is disconnected before anything connects (no connection at import time)', () => {
    expect(dbState()).toBe('disconnected');
    expect(isDbConnected()).toBe(false);
  });

  it('throws a clear error when no connection string is configured', async () => {
    await expect(connectDB('')).rejects.toThrow(/connection string is not configured/i);
  });

  it('fails fast against an unreachable cluster and stays disconnected', async () => {
    await expect(
      connectDB('mongodb://127.0.0.1:1/mediconsent_unreachable', {
        serverSelectionTimeoutMS: 1500,
      })
    ).rejects.toThrow();

    expect(dbState()).toBe('disconnected');
    expect(isDbConnected()).toBe(false);
  }, 30000);

  it('still serves both health endpoints and reports the degraded state', async () => {
    const [unversioned, versioned] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/v1/health'),
    ]);

    for (const res of [unversioned, versioned]) {
      expect(res.status).toBe(200);
      expect(res.body.database).toBe('disconnected');
      expect(res.body.databaseConnected).toBe(false);
      expect(res.body.degraded).toBe(true);
      // The API process itself is healthy even though the database is not.
      expect(res.body.status).toBe('ok');
    }
  });

  it('keeps non-database routes working while the database is down', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.service).toBe('MediConsent API');
  });
});
