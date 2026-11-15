import env, { isProduction } from './env.js';
import { authTokenTtlMs } from '../utils/token.js';

/** Name of the HttpOnly session cookie. */
export const AUTH_COOKIE_NAME = env.authCookieName;

/**
 * Base cookie flags.
 *  - httpOnly  : JavaScript can never read the token (no XSS token theft).
 *  - sameSite  : 'lax' - sent on top-level navigations, blocked on cross-site POSTs.
 *  - secure    : required in production; relaxed for local http development.
 *  - path      : '/' so the cookie is sent to every API route.
 */
function baseOptions() {
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/',
  };
}

/** Options used when issuing a session cookie. */
export function authCookieOptions() {
  return { ...baseOptions(), maxAge: authTokenTtlMs() };
}

/** Options used when clearing the cookie - must mirror baseOptions(). */
export function clearAuthCookieOptions() {
  return baseOptions();
}
