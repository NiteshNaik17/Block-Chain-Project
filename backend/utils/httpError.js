/**
 * Build an Error carrying an HTTP status code for the central error handler.
 */
export function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export default httpError;
