import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Private encrypted-file storage (Phase 8).
 *
 * Only CIPHERTEXT is ever written here - plaintext medical documents never touch
 * the disk. The directory lives outside the frontend's public/assets folder, is
 * git-ignored, and is never served by Express.
 *
 * Hard rules enforced by this module:
 *  - storage names are random, server-generated opaque identifiers; a user
 *    filename is never part of a path;
 *  - only a reference matching `scope/<hex id>` can be resolved, so no
 *    untrusted input can traverse out of the private root;
 *  - missing or unreadable files fail as a plain 404 - the path is never echoed
 *    back to the client;
 *  - a failed write is cleaned up so no partial file is left behind.
 *
 * NOTE: local private storage is appropriate for this college demonstration. A
 * production deployment should move ciphertext to durable private object
 * storage (e.g. an S3 bucket with SSE and no public access) behind the same
 * interface.
 */

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(MODULE_DIR, '..', 'private_uploads');

/** The only storage scopes this application creates. */
export const STORAGE_SCOPES = ['records', 'certificates'];

/** Server-generated references only: `<scope>/<32-64 hex chars>`. */
const REFERENCE_PATTERN = new RegExp(`^(${STORAGE_SCOPES.join('|')})/([a-f0-9]{32,64})$`);

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const ID_BYTES = 24;

function storageError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * Absolute private root. `PRIVATE_STORAGE_DIR` may override it (used by the
 * test suite to point at an isolated temporary directory).
 */
export function getStorageRoot() {
  const configured = String(process.env.PRIVATE_STORAGE_DIR ?? '').trim();
  return configured ? path.resolve(configured) : DEFAULT_ROOT;
}

/** True when the value is a well-formed internal storage reference. */
export function isStorageReference(value) {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value);
}

/** A fresh, opaque, server-generated reference for a new encrypted file. */
export function createStorageReference(scope) {
  if (!STORAGE_SCOPES.includes(scope)) {
    throw storageError(500, 'Unsupported private storage scope.', 'INVALID_STORAGE_SCOPE');
  }
  return `${scope}/${crypto.randomBytes(ID_BYTES).toString('hex')}`;
}

/**
 * Map an internal reference to an absolute path inside the private root.
 * Anything that is not a server-generated reference is rejected outright, which
 * also makes path traversal (`../`) impossible.
 */
export function resolveStoragePath(reference) {
  if (!isStorageReference(reference)) {
    throw storageError(400, 'Invalid file reference.', 'INVALID_FILE_REFERENCE');
  }

  const root = getStorageRoot();
  const absolute = path.resolve(root, reference);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (!absolute.startsWith(prefix)) {
    throw storageError(400, 'Invalid file reference.', 'INVALID_FILE_REFERENCE');
  }

  return absolute;
}

/**
 * Write ciphertext to private storage.
 * Uses the exclusive `wx` flag so an existing file is never overwritten, then
 * verifies the byte count that actually reached the disk.
 */
export async function saveEncryptedFile(reference, ciphertext) {
  const absolute = resolveStoragePath(reference);
  const buffer = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext ?? '');

  await fs.mkdir(path.dirname(absolute), { recursive: true, mode: DIRECTORY_MODE });

  try {
    await fs.writeFile(absolute, buffer, { mode: FILE_MODE, flag: 'wx' });
  } catch (error) {
    await removeFileQuietly(absolute);
    if (error?.code === 'EEXIST') {
      throw storageError(
        500,
        'The encrypted document could not be stored.',
        'STORAGE_REFERENCE_COLLISION'
      );
    }
    throw storageError(500, 'The encrypted document could not be stored.', 'STORAGE_WRITE_FAILED');
  }

  // A partial write must never be left behind as if it were a valid document.
  const stats = await fs.stat(absolute).catch(() => null);
  if (!stats || stats.size !== buffer.length) {
    await removeFileQuietly(absolute);
    throw storageError(500, 'The encrypted document could not be stored.', 'STORAGE_WRITE_FAILED');
  }

  return { size: buffer.length };
}

/** Read ciphertext back. A missing/unreadable file is a plain "not available". */
export async function readEncryptedFile(reference) {
  const absolute = resolveStoragePath(reference);

  try {
    return await fs.readFile(absolute);
  } catch {
    throw storageError(404, 'This medical document is not available.', 'FILE_NOT_AVAILABLE');
  }
}

/** Best-effort delete. Never throws: cleanup must not mask the real failure. */
export async function removeEncryptedFile(reference) {
  if (!isStorageReference(reference)) return false;
  return removeFileQuietly(resolveStoragePath(reference));
}

async function removeFileQuietly(absolute) {
  try {
    await fs.unlink(absolute);
    return true;
  } catch {
    return false;
  }
}

export default {
  STORAGE_SCOPES,
  getStorageRoot,
  isStorageReference,
  createStorageReference,
  resolveStoragePath,
  saveEncryptedFile,
  readEncryptedFile,
  removeEncryptedFile,
};
