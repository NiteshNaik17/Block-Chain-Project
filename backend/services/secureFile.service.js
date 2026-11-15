import { decryptBuffer, encryptBuffer, ENCRYPTION_ALGORITHM, ENCRYPTION_VERSION } from '../utils/encryption.js';
import { hashBuffer, verifyHash } from '../utils/integrity.js';
import {
  createStorageReference,
  readEncryptedFile,
  removeEncryptedFile,
  saveEncryptedFile,
} from '../utils/privateStorage.js';
import { httpError } from './auth.service.js';

/**
 * Secure file pipeline (Phase 8).
 *
 * This is the ONLY place that turns a plaintext upload into stored ciphertext,
 * and the only place that turns stored ciphertext back into a verified document.
 * Everything sensitive stays inside this module - callers receive safe metadata
 * or a plaintext buffer, never a path, a key, an IV or an authentication tag.
 *
 * Upload order (a failure at any step undoes the previous ones):
 *   1. SHA-256 the ORIGINAL plaintext
 *   2. AES-256-GCM encrypt it with a fresh random IV
 *   3. write ONLY the ciphertext to private storage under a random id
 *   4. return safe metadata for MongoDB (never the plaintext)
 *
 * Retrieval order:
 *   1. read the ciphertext from private storage
 *   2. decrypt in memory (GCM rejects tampered bytes / tags / keys)
 *   3. re-hash the plaintext and compare with the stored digest
 *   4. only then hand the buffer back for streaming
 */

/**
 * Encrypt and persist a plaintext upload.
 *
 * @param {{ buffer: Buffer, scope: 'records'|'certificates' }} params
 * @returns {Promise<{fileReference: string, integrityHash: string, encryptionIv: string, authTag: string, encryptionAlgorithm: string, encryptionVersion: number, fileSize: number}>}
 */
export async function storeEncryptedFile({ buffer, scope }) {
  const plainBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? '');
  if (plainBuffer.length === 0) {
    throw httpError(400, 'Select a file to upload.', 'FILE_REQUIRED');
  }

  // 1. Integrity digest of the original file (not of the ciphertext).
  const integrityHash = hashBuffer(plainBuffer);

  // 2. Authenticated encryption with a unique random IV per file.
  const { ciphertext, iv, authTag, algorithm, version } = encryptBuffer(plainBuffer);

  // 3. Ciphertext-only, server-named write.
  const fileReference = createStorageReference(scope);
  await saveEncryptedFile(fileReference, ciphertext);

  // 4. Safe metadata for MongoDB.
  return {
    fileReference,
    integrityHash,
    encryptionIv: iv,
    authTag,
    encryptionAlgorithm: algorithm || ENCRYPTION_ALGORITHM,
    encryptionVersion: version ?? ENCRYPTION_VERSION,
    // The size shown to the user is the size of their original file.
    fileSize: plainBuffer.length,
  };
}

/**
 * Read, decrypt and integrity-check a stored document.
 * Throws a generic, non-revealing error when the reference is missing, the
 * ciphertext was tampered with, or the digest does not match.
 *
 * @param {{fileReference: string, encryptionIv: string, authTag: string, integrityHash: string}} record
 * @returns {Promise<Buffer>} verified plaintext (in memory only)
 */
export async function readVerifiedFile(record) {
  if (!record || typeof record.fileReference !== 'string' || record.fileReference === '') {
    throw httpError(404, 'This medical document is not available.', 'FILE_NOT_AVAILABLE');
  }

  const ciphertext = await readEncryptedFile(record.fileReference);

  // GCM verification happens here: a tampered ciphertext, a tampered tag or a
  // wrong key cannot produce plaintext.
  const plaintext = decryptBuffer({
    ciphertext,
    iv: record.encryptionIv,
    authTag: record.authTag,
  });

  if (!verifyHash(plaintext, record.integrityHash)) {
    // The bytes decrypted but are not the original file. Do not deliver them and
    // do not describe the mismatch in any detail.
    throw httpError(
      500,
      'The stored file failed its integrity check and was not delivered.',
      'FILE_INTEGRITY_MISMATCH'
    );
  }

  return plaintext;
}

export { removeEncryptedFile };
export default { storeEncryptedFile, readVerifiedFile, removeEncryptedFile };
