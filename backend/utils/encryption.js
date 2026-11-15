import crypto from 'node:crypto';

import env from '../config/env.js';
import { httpError } from '../services/auth.service.js';

/**
 * AES-256-GCM file encryption (Phase 8).
 *
 * Design rules enforced here:
 *  - Only Node's built-in `crypto` module is used; no custom cryptography.
 *  - The master key is 32 raw bytes, supplied as 64 hexadecimal characters in
 *    MASTER_ENCRYPTION_KEY. It is never hardcoded, never logged and never
 *    returned in a response.
 *  - Every file gets its own cryptographically random 12-byte IV.
 *  - GCM authenticates the ciphertext: a tampered byte or a wrong key makes
 *    decryption fail instead of returning corrupted plaintext.
 *  - The authentication tag is stored next to the ciphertext metadata so the
 *    file can be verified on retrieval.
 */

export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
export const ENCRYPTION_VERSION = 1;
export const IV_BYTES = 12;
export const KEY_BYTES = 32;
export const MASTER_KEY_HEX_LENGTH = KEY_BYTES * 2;
export const AUTH_TAG_BYTES = 16;

const HEX_PATTERN = /^[a-f0-9]+$/i;

/** A stable, non-revealing error. The key value is never part of the message. */
function keyError(code) {
  return httpError(
    500,
    'Secure file storage is not configured. Please contact an administrator.',
    code
  );
}

/**
 * Validate and decode the 32-byte master encryption key.
 * Accepts an explicit override so the format can be unit-tested; production
 * callers rely on the environment configuration.
 */
export function resolveMasterKey(raw = process.env.MASTER_ENCRYPTION_KEY || env.masterEncryptionKey) {
  const value = String(raw ?? '').trim();

  if (!value) throw keyError('ENCRYPTION_KEY_MISSING');
  if (value.length !== MASTER_KEY_HEX_LENGTH || !HEX_PATTERN.test(value)) {
    throw keyError('ENCRYPTION_KEY_INVALID');
  }

  return Buffer.from(value, 'hex');
}

/** True when a valid master key is configured. Never throws. */
export function isEncryptionConfigured() {
  try {
    resolveMasterKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a plaintext buffer with AES-256-GCM.
 * Returns the ciphertext plus the metadata that must be stored alongside it.
 */
export function encryptBuffer(plainBuffer, options = {}) {
  const buffer = Buffer.isBuffer(plainBuffer)
    ? plainBuffer
    : Buffer.from(plainBuffer ?? '');

  const masterKey = resolveMasterKey(options.key ?? (process.env.MASTER_ENCRYPTION_KEY || env.masterEncryptionKey));
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    algorithm: ENCRYPTION_ALGORITHM,
    version: ENCRYPTION_VERSION,
  };
}

/**
 * Decrypt a stored ciphertext in memory.
 *
 * A tampered ciphertext, a tampered authentication tag or the wrong master key
 * all raise the same generic error - the caller learns that the file failed its
 * security check, never why, and never a detail about the key.
 */
export function decryptBuffer(stored = {}, options = {}) {
  const masterKey = resolveMasterKey(options.key ?? (process.env.MASTER_ENCRYPTION_KEY || env.masterEncryptionKey));

  try {
    const ivBuffer = Buffer.from(String(stored.iv ?? ''), 'hex');
    const tagBuffer = Buffer.from(String(stored.authTag ?? ''), 'hex');

    if (ivBuffer.length !== IV_BYTES || tagBuffer.length !== AUTH_TAG_BYTES) {
      throw new Error('Invalid IV or authentication tag length');
    }

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, masterKey, ivBuffer);
    decipher.setAuthTag(tagBuffer);

    return Buffer.concat([decipher.update(stored.ciphertext), decipher.final()]);
  } catch {
    throw httpError(500, 'The stored file failed its security check.', 'FILE_DECRYPTION_FAILED');
  }
}

export default {
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_VERSION,
  IV_BYTES,
  KEY_BYTES,
  MASTER_KEY_HEX_LENGTH,
  AUTH_TAG_BYTES,
  resolveMasterKey,
  isEncryptionConfigured,
  encryptBuffer,
  decryptBuffer,
};
