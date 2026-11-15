import bcrypt from 'bcryptjs';

/** Cost factor for bcrypt. 12 is a sensible balance for a demo/college build. */
export const SALT_ROUNDS = 12;

/** Hash a plain-text password. The plain value is never persisted or logged. */
export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/** Constant-time-ish comparison of a plain password against a stored hash. */
export async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}
