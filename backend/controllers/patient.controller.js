import { toSafeUser } from '../services/auth.service.js';
import {
  approveAccessRequest,
  createMedicalRecord,
  getDashboard,
  getProfile,
  getRecordById,
  getRecordDocument,
  listAccessHistory,
  listAccessRequests,
  listActiveConsents,
  listConsentHistory,
  listNotifications,
  listRecords,
  markAllNotificationsRead,
  markNotificationRead,
  rejectAccessRequest,
  updateProfile,
} from '../services/patient.service.js';
import {
  prepareConsentGrant,
  synchronizeConsentGrant,
  prepareConsentRevocation,
  synchronizeConsentRevocation,
} from '../services/consent.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Patient portal controllers (Phase 5).
 *
 * Controllers stay thin: they read the patient id from the AUTHENTICATED user
 * (`req.user._id` - set by requireAuth) and delegate to the patient service.
 * A patient id supplied by the client is never read, so it can never influence
 * ownership.
 */

/** GET /api/v1/patient/dashboard */
export const dashboard = asyncHandler(async (req, res) => {
  const data = await getDashboard(req.user._id);
  res.status(200).json({ success: true, message: 'Patient dashboard loaded.', data });
});

/** GET /api/v1/patient/records */
export const listMedicalRecords = asyncHandler(async (req, res) => {
  const data = await listRecords(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Medical records loaded.', data });
});

/** GET /api/v1/patient/records/:id */
export const getMedicalRecord = asyncHandler(async (req, res) => {
  const record = await getRecordById(req.user._id, req.params.id);
  res.status(200).json({ success: true, message: 'Medical record loaded.', data: { record } });
});

/**
 * POST /api/v1/patient/records
 *
 * `req.file` holds the upload in memory (Multer memoryStorage). The plaintext is
 * hashed, encrypted and only the ciphertext is written to private storage.
 */
export const uploadMedicalRecord = asyncHandler(async (req, res) => {
  const record = await createMedicalRecord(req.user._id, {
    file: req.file,
    fields: req.body ?? {},
  });

  res.status(201).json({
    success: true,
    message: 'Medical document encrypted and stored securely.',
    data: { record },
  });
});

/**
 * Build a safe Content-Disposition value for an untrusted file name.
 * An ASCII fallback is provided for legacy clients, plus the RFC 5987 encoded
 * form for everything else. Quotes, control characters and path separators are
 * removed - the header can never carry a filesystem path.
 */
function contentDisposition(fileName) {
  const safe = String(fileName ?? 'document');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/'/g, '%27');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * GET /api/v1/patient/records/:id/download
 *
 * The record is decrypted and SHA-256 verified entirely in memory; the response
 * carries the document bytes only - never a storage path, key, IV or tag.
 */
export const downloadMedicalRecord = asyncHandler(async (req, res) => {
  const { buffer, fileName, mimeType } = await getRecordDocument(req.user._id, req.params.id);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', contentDisposition(fileName));
  // Never let a browser sniff a different content type, and never cache a
  // medical document in an intermediary.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  return res.status(200).send(buffer);
});

/** GET /api/v1/patient/requests */
export const listRequests = asyncHandler(async (req, res) => {
  const data = await listAccessRequests(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Access requests loaded.', data });
});

/**
 * PATCH /api/v1/patient/requests/:id/approve
 *
 * Records the patient's decision. This does NOT create a consent, grant file
 * access, or write anything on-chain - blockchain consent is Phase 9.
 *
 * `recordIds` (optional) carries the patient's own record selection for a
 * Phase 6 category-first request; the service validates every id for ownership.
 */
export const approveRequest = asyncHandler(async (req, res) => {
  const request = await approveAccessRequest(req.user._id, req.params.id, req.body?.recordIds);
  res.status(200).json({
    success: true,
    message:
      'Decision recorded: you approved this request. No blockchain-backed consent has been created yet.',
    data: { request, consentCreated: false, blockchainBacked: false },
  });
});

/** PATCH /api/v1/patient/requests/:id/reject */
export const rejectRequest = asyncHandler(async (req, res) => {
  const request = await rejectAccessRequest(req.user._id, req.params.id, req.body?.reason);
  res.status(200).json({
    success: true,
    message: 'Decision recorded: you rejected this request.',
    data: { request, consentCreated: false, blockchainBacked: false },
  });
});

/** GET /api/v1/patient/consents */
export const listConsents = asyncHandler(async (req, res) => {
  const data = await listActiveConsents(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Consents loaded.', data });
});

/** POST /api/v1/patient/consents/prepare - returns parameters for signing grant in MetaMask */
export const prepareGrant = asyncHandler(async (req, res) => {
  const data = await prepareConsentGrant(req.user._id, req.body);
  res.status(200).json({ success: true, message: 'Consent grant parameters prepared.', data });
});

/** POST /api/v1/patient/consents/grant - synchronizes mined grant transaction */
export const grantConsent = asyncHandler(async (req, res) => {
  const data = await synchronizeConsentGrant(req.user._id, req.body);
  res.status(201).json({ success: true, message: data.message, data: data.consent, reconciled: data.reconciled });
});

/** GET /api/v1/patient/consents/:id/revoke/prepare */
export const prepareRevoke = asyncHandler(async (req, res) => {
  const data = await prepareConsentRevocation(req.user._id, req.params.id);
  res.status(200).json({ success: true, message: 'Revocation parameters prepared.', data });
});

/** POST /api/v1/patient/consents/:id/revoke - synchronizes mined revocation transaction */
export const revokeConsent = asyncHandler(async (req, res) => {
  const data = await synchronizeConsentRevocation(req.user._id, req.params.id, req.body);
  res.status(200).json({ success: true, message: data.message, data: data.consent });
});

/** GET /api/v1/patient/consent-history */
export const consentHistory = asyncHandler(async (req, res) => {
  const data = await listConsentHistory(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Consent history loaded.', data });
});

/** GET /api/v1/patient/access-history */
export const accessHistory = asyncHandler(async (req, res) => {
  const data = await listAccessHistory(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Access history loaded.', data });
});

/** GET /api/v1/patient/profile */
export const profile = asyncHandler(async (req, res) => {
  const user = await getProfile(req.user._id);
  res.status(200).json({ success: true, message: 'Profile loaded.', user });
});

/** PATCH /api/v1/patient/profile */
export const updatePatientProfile = asyncHandler(async (req, res) => {
  const user = await updateProfile(req.user._id, req.body ?? {});
  res.status(200).json({ success: true, message: 'Profile updated.', user });
});

/** GET /api/v1/patient/notifications */
export const notifications = asyncHandler(async (req, res) => {
  const data = await listNotifications(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Notifications loaded.', data });
});

/** PATCH /api/v1/patient/notifications/:id/read */
export const readNotification = asyncHandler(async (req, res) => {
  const data = await markNotificationRead(req.user._id, req.params.id);
  res.status(200).json({ success: true, message: 'Notification marked as read.', data });
});

/** PATCH /api/v1/patient/notifications/read-all */
export const readAllNotifications = asyncHandler(async (req, res) => {
  const data = await markAllNotificationsRead(req.user._id);
  res.status(200).json({ success: true, message: 'All notifications marked as read.', data });
});

/** GET /api/v1/patient/access - role-guard probe retained from Phase 4. */
export const patientAccess = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Patient portal access granted.',
    user: toSafeUser(req.user),
  });
});

export default {
  dashboard,
  listMedicalRecords,
  getMedicalRecord,
  uploadMedicalRecord,
  downloadMedicalRecord,
  listRequests,
  approveRequest,
  rejectRequest,
  listConsents,
  prepareGrant,
  grantConsent,
  prepareRevoke,
  revokeConsent,
  consentHistory,
  accessHistory,
  profile,
  updatePatientProfile,
  notifications,
  readNotification,
  readAllNotifications,
  patientAccess,
};
