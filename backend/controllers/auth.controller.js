import { AUTH_COOKIE_NAME, authCookieOptions, clearAuthCookieOptions } from '../config/authCookie.js';
import { recordActivity } from '../services/activity.service.js';
import { authenticateUser, registerUser, toSafeUser } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAuthToken } from '../utils/token.js';

/** Issue the session cookie. The JWT itself is never returned in the body. */
function issueSession(res, user) {
  const token = signAuthToken(user);
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
}

/**
 * POST /api/v1/auth/register/patient
 * Role and account status are assigned by the server - never by the request.
 */
export const registerPatient = asyncHandler(async (req, res) => {
  const { fullName, email, mobileNumber, password } = req.body;

  const user = await registerUser({ role: 'patient', fullName, email, mobileNumber, password });

  // Consistent approach across the app: registration signs the user straight in.
  issueSession(res, user);

  await recordActivity({
    actorId: user._id,
    actorRole: 'patient',
    action: 'auth.register.patient',
    description: 'New patient account registered',
    targetType: 'User',
    targetId: user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Patient account created successfully.',
    user: toSafeUser(user),
  });
});

/**
 * POST /api/v1/auth/register/doctor
 * Doctors are always created as pending and unverified; only an administrator
 * can change that.
 */
export const registerDoctor = asyncHandler(async (req, res) => {
  const { fullName, email, mobileNumber, password, medicalRegistrationNumber, specialization, hospitalName } =
    req.body;

  const user = await registerUser({
    role: 'doctor',
    fullName,
    email,
    mobileNumber,
    password,
    profile: { medicalRegistrationNumber, specialization, hospitalName },
  });

  issueSession(res, user);

  await recordActivity({
    actorId: user._id,
    actorRole: 'doctor',
    action: 'auth.register.doctor',
    description: 'New doctor application submitted (pending verification)',
    targetType: 'User',
    targetId: user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Doctor application submitted. An administrator will review it shortly.',
    user: toSafeUser(user),
  });
});

/** POST /api/v1/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await authenticateUser({ email, password });
  issueSession(res, user);

  await recordActivity({
    actorId: user._id,
    actorRole: user.role,
    action: 'auth.login',
    description: `${user.role} signed in`,
    targetType: 'User',
    targetId: user._id,
  });

  res.status(200).json({
    success: true,
    message: 'Signed in successfully.',
    user: toSafeUser(user),
  });
});

/** POST /api/v1/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
  res.status(200).json({ success: true, message: 'Signed out successfully.' });
});

/** GET /api/v1/auth/me - the authoritative source of the current session. */
export const me = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: toSafeUser(req.user) });
});

export default { registerPatient, registerDoctor, login, logout, me };
