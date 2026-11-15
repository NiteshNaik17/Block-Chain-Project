import mongoose from 'mongoose';

import { isProduction } from '../config/env.js';

/** 404 handler for unmatched routes. */
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/** Error names thrown by the MongoDB driver when the cluster is unreachable. */
const MONGO_UNAVAILABLE_ERRORS = [
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoTimeoutError',
  'MongooseTimeoutError',
];

function isMongoUnavailable(err) {
  if (MONGO_UNAVAILABLE_ERRORS.includes(err.name)) return true;
  // Mongoose buffers operations when there is no connection; surface that as
  // "service unavailable" rather than an opaque 500.
  return typeof err.message === 'string' && err.message.includes('buffering timed out');
}

function buildResponse(statusCode, message, extra = {}) {
  return { success: false, message, ...extra };
}

/**
 * Central error handler. Always replies with a consistent JSON envelope and
 * never leaks stack traces or internal details in production.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || err.status || 500;
  let body = buildResponse(statusCode, err.message || 'Internal server error');

  // --- Request validation (express-validator / validateRequest) -------------
  if (Array.isArray(err.validationErrors) && err.validationErrors.length > 0) {
    statusCode = 400;
    body = buildResponse(400, 'Request validation failed', { errors: err.validationErrors });
  }
  // --- Mongoose schema validation -------------------------------------------
  else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    const errors = Object.values(err.errors).map((issue) => ({
      field: issue.path,
      message: issue.message,
    }));
    body = buildResponse(400, 'Request validation failed', { errors });
  }
  // --- Invalid ObjectId / type cast -----------------------------------------
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    body = buildResponse(400, `Invalid value provided for "${err.path}"`, {
      errors: [{ field: err.path, message: `Value is not a valid ${err.kind}` }],
    });
  }
  // --- Duplicate key (e.g. email or medical registration number already used) -
  else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    body = buildResponse(409, `A record with this ${field} already exists`, {
      errors: [{ field, message: 'Value must be unique' }],
    });
  }
  // --- MongoDB unreachable / not connected ----------------------------------
  else if (isMongoUnavailable(err)) {
    statusCode = 503;
    body = buildResponse(503, 'Database is currently unavailable. Please try again later.');
  }
  // --- Malformed JSON body --------------------------------------------------
  else if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    statusCode = 400;
    body = buildResponse(400, 'Request body contains invalid JSON');
  }
  // --- Body too large -------------------------------------------------------
  else if (err.type === 'entity.too.large') {
    statusCode = 413;
    body = buildResponse(413, 'Request payload is too large');
  }

  // A stable machine-readable code helps the client react (e.g. route a pending
  // doctor to the verification screen) without parsing messages.
  if (typeof err.code === 'string') body.code = err.code;
  if (err.verificationStatus) body.verificationStatus = err.verificationStatus;
  if (err.accountStatus) body.accountStatus = err.accountStatus;

  if (statusCode >= 500) {
    console.error('[MediConsent] Unhandled error:', err);
  }

  // Stack traces are development-only and never returned in production.
  if (!isProduction && statusCode >= 500 && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

export default { notFound, errorHandler };
