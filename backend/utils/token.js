import jwt from 'jsonwebtoken';

import env from '../config/env.js';

const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Convert a JWT-style duration ("1d", "12h", "30m", "3600") into milliseconds so
 * the cookie lifetime and the token lifetime cannot drift apart.
 */
export function parseDurationToMs(value, fallbackMs = DEFAULT_TTL_MS) {
  if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;
  if (typeof value !== 'string') return fallbackMs;

  const match = /^\s*(\d+)\s*(ms|s|m|h|d|w)?\s*$/i.exec(value);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  return amount * (UNIT_MS[unit] ?? 1000);
}

/** Cookie max-age, derived from JWT_EXPIRES_IN. */
export function authTokenTtlMs() {
  return parseDurationToMs(env.jwtExpiresIn, DEFAULT_TTL_MS);
}

function requireSecret() {
  if (!env.jwtSecret) {
    const error = new Error('Authentication is not configured (JWT_SECRET is missing)');
    error.statusCode = 500;
    error.code = 'JWT_SECRET_MISSING';
    throw error;
  }
  return env.jwtSecret;
}

/** Sign a short-lived session token containing only the user id and role. */
export function signAuthToken(user) {
  const id = String(user._id ?? user.id);
  return jwt.sign({ sub: id, role: user.role }, requireSecret(), {
    expiresIn: env.jwtExpiresIn,
  });
}

/** Verify a session token. Throws JsonWebTokenError / TokenExpiredError. */
export function verifyAuthToken(token) {
  return jwt.verify(token, requireSecret());
}
