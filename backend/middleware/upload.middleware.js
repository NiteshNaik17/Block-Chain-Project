import multer from 'multer';

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '../utils/fileValidation.js';

/**
 * Upload handling (Phase 8).
 *
 * Files are received into MEMORY, never onto disk: the plaintext exists only as
 * a Buffer for the duration of the request and is encrypted before anything is
 * persisted. A disk-backed Multer storage would violate the "never store
 * plaintext medical documents on disk" rule.
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 20,
    fieldSize: 8192,
  },
});

/**
 * Translate Multer's own errors into the project's error envelope so an
 * oversized upload returns a clean 413 instead of an opaque 500. Internal
 * details (field names, paths, limits beyond the published size) are not
 * echoed back.
 */
function translateUploadError(error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      const translated = new Error(
        `File is too large. The maximum size is ${MAX_UPLOAD_LABEL}.`
      );
      translated.statusCode = 413;
      translated.code = 'FILE_TOO_LARGE';
      return translated;
    }

    const translated = new Error('The upload could not be processed.');
    translated.statusCode = 400;
    translated.code = 'UPLOAD_REJECTED';
    return translated;
  }

  return error;
}

/** `upload.single(field)` with Multer errors mapped to safe API errors. */
function singleFileMiddleware(fieldName) {
  const handler = upload.single(fieldName);

  return (req, res, next) => {
    handler(req, res, (error) => {
      if (!error) return next();
      return next(translateUploadError(error));
    });
  };
}

/** A single medical document, sent as the `file` field. */
export const uploadMedicalDocument = singleFileMiddleware('file');

/** A single doctor verification certificate, sent as the `certificate` field. */
export const uploadCertificateDocument = singleFileMiddleware('certificate');

export default { uploadMedicalDocument, uploadCertificateDocument };
