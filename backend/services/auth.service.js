import User from '../models/User.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

/**
 * Authentication service.
 *
 * All user-supplied values are treated as untrusted: `role`, `accountStatus` and
 * `verificationStatus` are ALWAYS derived server-side from the endpoint being
 * called - they can never be set by a public registration request.
 */

/** A decoy hash so a login for an unknown email still costs a bcrypt round-trip. */
const DECOY_HASH = '$2a$12$0000000000000000000000000000000000000000000000000000';

/** Build an Error carrying an HTTP status code for the central error handler. */
export function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

/**
 * Safe, upload-status-only view of a doctor's verification certificate (Phase 8).
 * Exposes the display file name and review state - never the private storage
 * reference, the AES-GCM IV, the authentication tag or the encryption key.
 */
export function toSafeCertificate(user) {
  if (!user || user.role !== 'doctor') return null;

  const uploaded = Boolean(user.certificateFileReference);
  const metadata = user.certificateMetadata ?? {};

  return {
    uploaded,
    fileName: uploaded ? metadata.originalFileName ?? null : null,
    mimeType: uploaded ? metadata.mimeType ?? null : null,
    fileSize: uploaded ? metadata.fileSize ?? null : null,
    uploadedAt: uploaded ? metadata.uploadedAt ?? null : null,
    // Uploading a certificate never changes the verification status - an
    // administrator still has to review and approve the application.
    reviewStatus: user.verificationStatus ?? null,
  };
}

/** Whitelisted, serialisable view of a user. Never contains passwordHash. */
export function toSafeUser(user) {
  if (!user) return null;
  return {
    id: String(user._id ?? user.id),
    fullName: user.fullName,
    email: user.email,
    mobileNumber: user.mobileNumber,
    role: user.role,
    accountStatus: user.accountStatus,
    verificationStatus: user.verificationStatus,
    profilePhoto: user.profilePhoto ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    gender: user.gender ?? null,
    address: user.address ?? null,
    emergencyContact: user.emergencyContact ?? null,
    bloodGroup: user.bloodGroup ?? null,
    medicalRegistrationNumber: user.medicalRegistrationNumber ?? null,
    specialization: user.specialization ?? null,
    hospitalName: user.hospitalName ?? null,
    // The private storage reference is internal-only and is deliberately never
    // serialised; clients receive the safe `certificate` summary instead.
    certificateFileReference: null,
    certificate: toSafeCertificate(user),
    verifiedAt: user.verifiedAt ?? null,
    verificationReason: user.verificationReason ?? null,
    walletAddress: user.walletAddress ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Create a patient or doctor account.
 * Role-derived statuses are assigned here, not by the caller.
 */
export async function registerUser({ role, fullName, email, mobileNumber, password, profile = {} }) {
  if (role !== 'patient' && role !== 'doctor') {
    throw httpError(400, 'Unsupported account type');
  }

  const normalizedEmail = normalizeEmail(email);
  if (await User.exists({ email: normalizedEmail })) {
    throw httpError(409, 'An account with this email address already exists', 'EMAIL_IN_USE');
  }

  if (role === 'doctor') {
    const registrationNumber = String(profile.medicalRegistrationNumber ?? '').trim();
    if (await User.exists({ medicalRegistrationNumber: registrationNumber })) {
      throw httpError(
        409,
        'This medical registration number is already registered',
        'REGISTRATION_NUMBER_IN_USE'
      );
    }
  }

  const passwordHash = await hashPassword(password);

  const user = new User({
    fullName,
    email: normalizedEmail,
    mobileNumber,
    passwordHash,
    role,
    // Statuses are decided by the server, never by the request body.
    accountStatus: role === 'doctor' ? 'pending' : 'active',
    verificationStatus: role === 'doctor' ? 'pending' : 'not_applicable',
    ...(role === 'doctor'
      ? {
          medicalRegistrationNumber: profile.medicalRegistrationNumber,
          specialization: profile.specialization,
          hospitalName: profile.hospitalName,
        }
      : {}),
  });

  await user.save();
  return user;
}

/**
 * Verify an email/password pair.
 * A missing account and a wrong password produce the SAME error so the response
 * never reveals whether an email belongs to a registered user.
 */
export async function authenticateUser({ email, password }) {
  const invalid = () => httpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

  const user = await User.findOne({ email: normalizeEmail(email) }).select('+passwordHash');
  if (!user) {
    await verifyPassword(password, DECOY_HASH); // equalise timing
    throw invalid();
  }

  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) throw invalid();

  // Credentials are valid - now enforce the account state.
  if (user.accountStatus === 'suspended') {
    throw httpError(403, 'This account has been suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
  }
  if (user.accountStatus === 'rejected') {
    throw httpError(403, 'This account application was rejected.', 'ACCOUNT_REJECTED');
  }

  return user;
}
