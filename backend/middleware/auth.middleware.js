import User from '../models/User.js';
import { AUTH_COOKIE_NAME } from '../config/authCookie.js';
import { verifyAuthToken } from '../utils/token.js';

/**
 * Authentication / authorization middleware.
 *
 * The token is read exclusively from the HttpOnly cookie. Role information is
 * loaded from the database on every request, so a tampered or stale frontend
 * value can never grant access.
 */

function unauthorized(message = 'Authentication required') {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function forbidden(message = 'You do not have permission to access this resource', code) {
  const error = new Error(message);
  error.statusCode = 403;
  if (code) error.code = code;
  return error;
}

/** Load and attach the authenticated user, or reject with 401. */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch {
      // Expired / malformed / bad-signature tokens are all "not authenticated".
      throw unauthorized('Your session is invalid or has expired. Please sign in again.');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw unauthorized('Your session is invalid or has expired. Please sign in again.');

    // Trust only the freshly-loaded database row.
    req.user = user;
    req.auth = { userId: String(user._id), role: user.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Require the authenticated user to hold one of the given roles. */
export function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This area is restricted to: ${roles.join(', ')}`, 'ROLE_NOT_PERMITTED'));
    }
    return next();
  };
}

/**
 * Require an authenticated, administrator-verified, active doctor.
 * A pending or rejected doctor is denied - being able to sign in does NOT
 * grant access to patient records.
 */
export function requireVerifiedDoctor(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'doctor') {
    return next(forbidden('This area is restricted to verified doctors', 'ROLE_NOT_PERMITTED'));
  }
  if (req.user.verificationStatus !== 'verified' || req.user.accountStatus !== 'active') {
    const error = forbidden(
      'Your doctor account is still awaiting administrator verification.',
      'DOCTOR_PENDING_VERIFICATION'
    );
    error.verificationStatus = req.user.verificationStatus;
    error.accountStatus = req.user.accountStatus;
    return next(error);
  }
  return next();
}

/**
 * Reject a signed-in account that is not active (for example one an
 * administrator has suspended). The suspended state is re-read from the
 * database on every request, so revoking access takes effect immediately.
 */
export function requireActiveAccount(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.accountStatus !== 'active') {
    return next(
      forbidden(
        'This account is not active. Please contact an administrator.',
        'ACCOUNT_INACTIVE'
      )
    );
  }
  return next();
}

/** Run a sequence of guards, short-circuiting on the first failure. */
function runGuards(guards) {
  return function guardChain(req, res, next) {
    let index = 0;
    const step = (error) => {
      if (error) return next(error);
      const guard = guards[index];
      index += 1;
      if (!guard) return next();
      return guard(req, res, step);
    };
    return step();
  };
}

/** Patient-only guard: an authenticated, active patient. */
export function requirePatient(req, res, next) {
  return runGuards([requireRole('patient'), requireActiveAccount])(req, res, next);
}

/** Doctor-only guard: an authenticated doctor (including pending verification). */
export function requireDoctor(req, res, next) {
  return runGuards([requireRole('doctor'), requireActiveAccount])(req, res, next);
}

/** Admin-only guard: an authenticated, active administrator. */
export function requireAdmin(req, res, next) {
  return runGuards([requireRole('admin'), requireActiveAccount])(req, res, next);
}

export default {
  requireAuth,
  requireRole,
  requireDoctor,
  requireVerifiedDoctor,
  requireActiveAccount,
  requirePatient,
  requireAdmin,
};
