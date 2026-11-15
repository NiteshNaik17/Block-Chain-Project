import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler, notFound } from '../middleware/error.middleware.js';
import User from '../models/User.js';

/**
 * Central error-handling middleware tests.
 *
 * A throwaway Express app is built per test so each error shape can be injected
 * directly - no production route is added just to exercise the handler.
 */

/** Build an app whose /boom route forwards `err` to the central handler. */
function appForwarding(err) {
  const app = express();
  app.get('/boom', (req, res, next) => next(err));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function captureValidationError(doc) {
  try {
    await doc.validate();
    throw new Error('expected validation to fail');
  } catch (err) {
    return err;
  }
}

beforeEach(() => {
  // Keep expected 5xx logging out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 3 - central error handling', () => {
  it('returns a JSON 404 for unmatched routes', async () => {
    const res = await request(appForwarding(null)).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Route not found');
    expect(res.body.message).toContain('/does-not-exist');
  });

  it('maps a Mongoose ValidationError to 400 with field details', async () => {
    const validationError = await captureValidationError(new User({ email: 'nope' }));
    const res = await request(appForwarding(validationError)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Request validation failed');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.map((e) => e.field)).toContain('email');
    // 4xx responses must never carry a stack trace.
    expect(res.body).not.toHaveProperty('stack');
  });

  it('maps an invalid ObjectId (CastError) to 400', async () => {
    const castError = new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    const res = await request(appForwarding(castError)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { field: '_id', message: 'Value is not a valid ObjectId' },
    ]);
  });

  it('maps a duplicate-key error to 409', async () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key error collection: users'), {
      code: 11000,
      keyValue: { email: 'ananya.sharma@example.com' },
    });

    const res = await request(appForwarding(duplicate)).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body.errors).toEqual([{ field: 'email', message: 'Value must be unique' }]);
  });

  it('maps an unreachable MongoDB cluster to 503', async () => {
    const serverSelection = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), {
      name: 'MongooseServerSelectionError',
    });

    const res = await request(appForwarding(serverSelection)).get('/boom');

    expect(res.status).toBe(503);
    expect(res.body.message).toContain('Database is currently unavailable');
  });

  it('maps a buffering timeout (no connection) to 503', async () => {
    const buffering = new Error('Operation `users.find()` buffering timed out after 10000ms');
    const res = await request(appForwarding(buffering)).get('/boom');

    expect(res.status).toBe(503);
  });

  it('falls back to 500 for unexpected errors', async () => {
    const res = await request(appForwarding(new Error('kaboom'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('kaboom');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const app = express();
    app.use(express.json());
    app.post('/echo', (req, res) => res.json({ ok: true }));
    app.use(notFound);
    app.use(errorHandler);

    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Request body contains invalid JSON');
  });

  it('returns 413 when the request body is too large', async () => {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    app.post('/echo', (req, res) => res.json({ ok: true }));
    app.use(notFound);
    app.use(errorHandler);

    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ payload: 'x'.repeat(5000) }));

    expect(res.status).toBe(413);
    expect(res.body.message).toBe('Request payload is too large');
  });
});
