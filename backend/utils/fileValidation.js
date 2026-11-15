import path from 'node:path';

/**
 * Upload validation (Phase 8).
 *
 * A browser-reported MIME type (`file.mimetype`) is a hint from the client and
 * can be forged, so it is deliberately NOT trusted. A file is accepted only
 * when BOTH:
 *   1. its extension is on the strict allow-list, and
 *   2. its first bytes (magic bytes / file signature) match that extension.
 * This rejects a renamed executable or a script pretending to be a PDF.
 *
 * Limits live here so the API, the Multer layer and the tests share one source
 * of truth.
 */

/** Hard upload ceiling: 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '10 MB';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The only accepted upload types. Each entry owns the extensions and the magic
 * bytes that identify it.
 */
export const ALLOWED_FILE_TYPES = [
  {
    key: 'pdf',
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
    matches: (buffer) =>
      buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    key: 'jpeg',
    mimeType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    matches: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    key: 'png',
    mimeType: 'image/png',
    extensions: ['.png'],
    matches: (buffer) =>
      buffer.length >= PNG_SIGNATURE.length &&
      PNG_SIGNATURE.every((byte, index) => buffer[index] === byte),
  },
];

export const ALLOWED_EXTENSIONS = ALLOWED_FILE_TYPES.flatMap((type) => type.extensions);
export const ALLOWED_MIME_TYPES = ALLOWED_FILE_TYPES.map((type) => type.mimeType);

const UNSUPPORTED_MESSAGE = `Only ${ALLOWED_EXTENSIONS.join(', ')} files are accepted.`;

function fileError(message, code) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

/** Lower-case extension of a filename, including the dot ('' when absent). */
export function extensionOf(fileName) {
  return path.extname(String(fileName ?? '')).toLowerCase();
}

/**
 * Reduce an untrusted client filename to a safe DISPLAY value.
 * The result is only ever stored as metadata / shown to the user - it is never
 * used to build a filesystem path (storage uses server-generated ids instead).
 */
export function sanitizeFileName(fileName) {
  const base = path
    .basename(String(fileName ?? ''))
    // Strip directory separators for both POSIX and Windows plus control chars.
    .replace(/[\\/]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  return base.slice(0, 255);
}

/** Identify a file from its leading bytes. Returns the type entry or null. */
export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  return ALLOWED_FILE_TYPES.find((type) => type.matches(buffer)) ?? null;
}

/**
 * Validate an in-memory upload.
 *
 * @param {{ originalname: string, buffer: Buffer, size?: number, mimetype?: string }} file
 * @returns {{ originalFileName: string, mimeType: string, extension: string, fileType: string, size: number }}
 * @throws 400 with a stable code for every rejection reason.
 */
export function validateUploadedFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw fileError('Select a file to upload.', 'FILE_REQUIRED');
  }

  const size = file.buffer.length;
  if (size > MAX_UPLOAD_BYTES) {
    throw fileError(`File is too large. The maximum size is ${MAX_UPLOAD_LABEL}.`, 'FILE_TOO_LARGE');
  }

  const originalFileName = sanitizeFileName(file.originalname);
  const extension = extensionOf(originalFileName);
  if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
    throw fileError(UNSUPPORTED_MESSAGE, 'UNSUPPORTED_FILE_TYPE');
  }

  const detected = detectFileType(file.buffer);
  // The signature must exist AND belong to the declared extension - a PDF named
  // ".png" (or a renamed script) fails here.
  if (!detected || !detected.extensions.includes(extension)) {
    throw fileError('The file content does not match its extension.', 'INVALID_FILE_SIGNATURE');
  }

  return {
    originalFileName,
    mimeType: detected.mimeType,
    extension,
    fileType: detected.key,
    size,
  };
}

export default {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  ALLOWED_FILE_TYPES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  extensionOf,
  sanitizeFileName,
  detectFileType,
  validateUploadedFile,
};
