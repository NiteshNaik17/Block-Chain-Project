/**
 * Wrap an async route handler so a rejected promise is forwarded to the
 * centralized error handler instead of crashing the process.
 */
export function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;
