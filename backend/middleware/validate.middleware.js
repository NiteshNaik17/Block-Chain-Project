import { validationResult } from 'express-validator';

/**
 * Collect express-validator results and forward a single 400 to the central
 * error handler, which renders the standard JSON error envelope.
 */
export function validateRequest(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const error = new Error('Request validation failed');
  error.statusCode = 400;
  error.validationErrors = result.array().map((issue) => ({
    field: issue.path,
    message: issue.msg,
  }));

  return next(error);
}

export default validateRequest;
