import {
  approveDoctor as approveDoctorService,
  getDashboard,
  getDoctor,
  getDoctorCertificateDocument,
  getPatient,
  getProfile,
  getUser,
  listActivityLogs,
  listDoctors,
  listNotifications,
  listPatients,
  listPendingDoctors as listPendingDoctorsService,
  listUsers,
  markAllNotificationsRead,
  markNotificationRead,
  rejectDoctor as rejectDoctorService,
  updateProfile,
  updateUserStatus,
} from '../services/admin.service.js';
import { toSafeUser } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Administrator portal controllers (Phase 7).
 *
 * Controllers stay thin: they read the administrator id from the AUTHENTICATED
 * user (`req.user._id` - set by requireAuth) and delegate to the admin service.
 * An id supplied by the client is never used to decide identity, so it can never
 * influence ownership or escalate privilege. Every route is mounted behind
 * requireAuth + requireAdmin, so only an active administrator reaches these
 * handlers.
 *
 * An administrator sees ACCOUNT and verification metadata only - never a medical
 * record, diagnosis, document reference or storage path.
 */

/** GET /api/v1/admin/dashboard */
export const dashboard = asyncHandler(async (req, res) => {
  const data = await getDashboard();
  res.status(200).json({ success: true, message: 'Admin dashboard loaded.', data });
});

// --- Patients ----------------------------------------------------------------

/** GET /api/v1/admin/patients */
export const patients = asyncHandler(async (req, res) => {
  const data = await listPatients(req.query);
  res.status(200).json({ success: true, message: 'Patient directory loaded.', data });
});

/** GET /api/v1/admin/patients/:id */
export const patient = asyncHandler(async (req, res) => {
  const data = await getPatient(req.params.id);
  res.status(200).json({ success: true, message: 'Patient account loaded.', data });
});

// --- Doctor verification -----------------------------------------------------

/**
 * GET /api/v1/admin/doctors/pending
 *
 * `data` deliberately stays a plain array with a sibling `counts` object so the
 * Phase 4 verification clients keep working; `pagination` is added alongside.
 */
export const listPendingDoctors = asyncHandler(async (req, res) => {
  const { doctors, counts, pagination } = await listPendingDoctorsService(req.query);
  res.status(200).json({
    success: true,
    message: 'Pending doctor applications loaded.',
    data: doctors,
    counts,
    pagination,
  });
});

/** GET /api/v1/admin/doctors */
export const doctors = asyncHandler(async (req, res) => {
  const data = await listDoctors(req.query);
  res.status(200).json({ success: true, message: 'Doctor directory loaded.', data });
});

/** GET /api/v1/admin/doctors/:id */
export const doctor = asyncHandler(async (req, res) => {
  const data = await getDoctor(req.params.id);
  res.status(200).json({ success: true, message: 'Doctor account loaded.', data });
});

/** PATCH /api/v1/admin/doctors/:id/approve */
export const approveDoctor = asyncHandler(async (req, res) => {
  const data = await approveDoctorService(req.user._id, req.params.id);
  res.status(200).json({ success: true, message: 'Doctor approved and account activated.', data });
});

/** PATCH /api/v1/admin/doctors/:id/reject */
export const rejectDoctor = asyncHandler(async (req, res) => {
  const data = await rejectDoctorService(req.user._id, req.params.id, req.body?.reason);
  res.status(200).json({ success: true, message: 'Doctor application rejected.', data });
});

// --- User management ---------------------------------------------------------

/** GET /api/v1/admin/users */
export const users = asyncHandler(async (req, res) => {
  const data = await listUsers(req.query);
  res.status(200).json({ success: true, message: 'User directory loaded.', data });
});

/** GET /api/v1/admin/users/:id */
export const user = asyncHandler(async (req, res) => {
  const data = await getUser(req.params.id);
  res.status(200).json({ success: true, message: 'User account loaded.', data });
});

/** PATCH /api/v1/admin/users/:id/status */
export const updateUserAccountStatus = asyncHandler(async (req, res) => {
  const data = await updateUserStatus(req.user._id, req.params.id, req.body ?? {});
  const verb = data.accountStatus === 'suspended' ? 'suspended' : 'reactivated';
  res.status(200).json({ success: true, message: `User account ${verb}.`, data });
});

// --- Activity logs -----------------------------------------------------------

/** GET /api/v1/admin/activity-logs - read-only audit trail. */
export const activityLogs = asyncHandler(async (req, res) => {
  const data = await listActivityLogs(req.query);
  res.status(200).json({ success: true, message: 'Activity logs loaded.', data });
});

// --- Profile -----------------------------------------------------------------

/** GET /api/v1/admin/profile */
export const profile = asyncHandler(async (req, res) => {
  const user = await getProfile(req.user._id);
  res.status(200).json({ success: true, message: 'Profile loaded.', user });
});

/** PATCH /api/v1/admin/profile - only the server's editable allow-list is accepted. */
export const updateAdminProfile = asyncHandler(async (req, res) => {
  const user = await updateProfile(req.user._id, req.body ?? {});
  res.status(200).json({ success: true, message: 'Profile updated.', user });
});

// --- Notifications -----------------------------------------------------------

/** GET /api/v1/admin/notifications - scoped to the authenticated administrator. */
export const notifications = asyncHandler(async (req, res) => {
  const data = await listNotifications(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Notifications loaded.', data });
});

/** PATCH /api/v1/admin/notifications/:id/read */
export const readNotification = asyncHandler(async (req, res) => {
  const data = await markNotificationRead(req.user._id, req.params.id);
  res.status(200).json({ success: true, message: 'Notification marked as read.', data });
});

/** PATCH /api/v1/admin/notifications/read-all */
export const readAllNotifications = asyncHandler(async (req, res) => {
  const data = await markAllNotificationsRead(req.user._id);
  res.status(200).json({ success: true, message: 'All notifications marked as read.', data });
});

// --- Guard probe -------------------------------------------------------------

/** GET /api/v1/admin/access - admin-only route guard probe. */
export const adminAccess = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Administrator access granted.',
    user: toSafeUser(req.user),
  });
});

function contentDisposition(fileName) {
  const safe = String(fileName ?? 'document');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/'/g, '%27');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * GET /api/v1/admin/doctors/:id/certificate
 *
 * Decrypts in memory and streams a doctor's verification certificate.
 * Protected by admin authorization and audited.
 */
export const downloadDoctorCertificate = asyncHandler(async (req, res) => {
  const { buffer, fileName, mimeType } = await getDoctorCertificateDocument(req.user._id, req.params.id);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', contentDisposition(fileName));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  return res.status(200).send(buffer);
});

export default {
  dashboard,
  patients,
  patient,
  listPendingDoctors,
  doctors,
  doctor,
  approveDoctor,
  rejectDoctor,
  downloadDoctorCertificate,
  users,
  user,
  updateUserAccountStatus,
  activityLogs,
  profile,
  updateAdminProfile,
  notifications,
  readNotification,
  readAllNotifications,
  adminAccess,
};
