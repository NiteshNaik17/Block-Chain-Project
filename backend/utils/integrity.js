import crypto from 'node:crypto';

/**
 * SHA-256 file integrity verification (Phase 8).
 *
 * A SHA-256 digest proves that a document is byte-for-byte the same file that
 * was uploaded. It is NOT encryption and it is NOT authorisation:
 *  - it does not hide or protect the contents (that is AES-256-GCM),
 *  - it does not decide who may read the file (that is authentication +
 *    authorisation + on-chain consent).
 * It only answers one question: "is this the original file?".
 *
 * The digest is taken from the ORIGINAL plaintext during upload, stored in
 * MongoDB, and recalculated after decryption on every download.
 */

export const HASH_ALGORITHM = 'sha256';
/** A SHA-256 digest is always 64 lowercase hexadecimal characters. */
export const HASH_HEX_LENGTH = 64;

const HASH_PATTERN = /^[a-f0-9]{64}$/;

/** Lowercase hex SHA-256 digest of a buffer. */
export function hashBuffer(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? '');
  return crypto.createHash(HASH_ALGORITHM).update(data).digest('hex');
}

/** True when the value looks like a stored SHA-256 digest. */
export function isHashShaped(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value.trim().toLowerCase());
}

/**
 * Constant-time comparison of a freshly computed digest with the stored one.
 * `timingSafeEqual` is used so the comparison never short-circuits on the first
 * differing byte. Any malformed expected value simply fails the check.
 */
export function verifyHash(buffer, expectedHash) {
  if (!isHashShaped(expectedHash)) return false;

  const actual = Buffer.from(hashBuffer(buffer), 'hex');
  const expected = Buffer.from(String(expectedHash).trim().toLowerCase(), 'hex');

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export default { HASH_ALGORITHM, HASH_HEX_LENGTH, hashBuffer, isHashShaped, verifyHash };
