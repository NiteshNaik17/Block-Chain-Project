import {
  createAccessRequest,
  downloadRecordForDoctor,
  getDashboard,
  getDoctorCertificate,
  getProfile,
  listAccessHistory,
  listAccessibleRecords,
  listDoctorRequests,
  listNotifications,
  listPatients,
  markAllNotificationsRead,
  markNotificationRead,
  updateProfile,
  uploadDoctorCertificate,
} from '../services/doctor.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Doctor portal controllers (Phase 6).
 *
 * Controllers stay thin: they read the doctor id from the AUTHENTICATED user
 * (`req.user._id` - set by requireAuth) and delegate to the doctor service.
 * A doctor id supplied by the client is never read, so it can never influence
 * ownership. Every route is mounted behind requireAuth + requireVerifiedDoctor,
 * so only an active, verified doctor can reach these handlers.
 */

/** GET /api/v1/doctor/dashboard */
export const dashboard = asyncHandler(async (req, res) => {
  const data = await getDashboard(req.user._id);
  res.status(200).json({ success: true, message: 'Doctor dashboard loaded.', data });
});

/**
 * GET /api/v1/doctor/patients
 * Minimum identifying information only - never a record, document or clinical
 * detail.
 */
export const patients = asyncHandler(async (req, res) => {
  const data = await listPatients(req.query);
  res.status(200).json({ success: true, message: 'Patient directory loaded.', data });
});

/**
 * POST /api/v1/doctor/requests
 *
 * Submits a category-first request. No records are supplied by the doctor and
 * no Consent is created - the patient selects the actual records when they
 * review the request.
 */
export const submitRequest = asyncHandler(async (req, res) => {
  const request = await createAccessRequest(req.user._id, req.body ?? {});
  res.status(201).json({
    success: true,
    message:
      'Access request submitted. The patient will review it and choose which records to share.',
    data: { request },
  });
});

/** GET /api/v1/doctor/requests */
export const requests = asyncHandler(async (req, res) => {
  const data = await listDoctorRequests(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Access requests loaded.', data });
});

/**
 * GET /api/v1/doctor/accessible-records
 *
 * Only ever returns records covered by a genuine, active, unexpired,
 * blockchain-anchored consent held by this doctor. An approved request alone is
 * never sufficient.
 */
export const accessibleRecords = asyncHandler(async (req, res) => {
  const data = await listAccessibleRecords(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Accessible records loaded.', data });
});

/** GET /api/v1/doctor/access-history */
export const accessHistory = asyncHandler(async (req, res) => {
  const data = await listAccessHistory(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Access history loaded.', data });
});

/** GET /api/v1/doctor/profile */
export const profile = asyncHandler(async (req, res) => {
  const user = await getProfile(req.user._id);
  res.status(200).json({ success: true, message: 'Profile loaded.', user });
});

/** PATCH /api/v1/doctor/profile - only the server's editable allow-list is accepted. */
export const updateDoctorProfile = asyncHandler(async (req, res) => {
  const user = await updateProfile(req.user._id, req.body ?? {});
  res.status(200).json({ success: true, message: 'Profile updated.', user });
});

/** GET /api/v1/doctor/notifications */
export const notifications = asyncHandler(async (req, res) => {
  const data = await listNotifications(req.user._id, req.query);
  res.status(200).json({ success: true, message: 'Notifications loaded.', data });
});

/** PATCH /api/v1/doctor/notifications/:id/read */
export const readNotification = asyncHandler(async (req, res) => {
  const data = await markNotificationRead(req.user._id, req.params.id);
  res.status(200).json({ success: true, message: 'Notification marked as read.', data });
});

/** PATCH /api/v1/doctor/notifications/read-all */
export const readAllNotifications = asyncHandler(async (req, res) => {
  const data = await markAllNotificationsRead(req.user._id);
  res.status(200).json({ success: true, message: 'All notifications marked as read.', data });
});

// --- Certificate & Document Security (Phase 8) -------------------------------

/** POST /api/v1/doctor/certificate */
export const uploadCertificate = asyncHandler(async (req, res) => {
  const certificate = await uploadDoctorCertificate(req.user._id, req.file);
  res.status(200).json({
    success: true,
    message: 'Verification certificate encrypted and uploaded successfully.',
    data: { certificate },
  });
});

/** GET /api/v1/doctor/certificate */
export const certificateStatus = asyncHandler(async (req, res) => {
  const certificate = await getDoctorCertificate(req.user._id);
  res.status(200).json({
    success: true,
    message: 'Certificate status loaded.',
    data: { certificate },
  });
});

/** GET /api/v1/doctor/records/:id/download */
export const downloadMedicalRecordForDoctor = asyncHandler(async (req, res) => {
  const result = await downloadRecordForDoctor(req.user._id, req.params.id);

  const safeFilename = encodeURIComponent(result.filename).replace(/['()]/g, escape);
  res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${result.filename.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${safeFilename}`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  return res.status(200).send(result.buffer);
});

export default {
  dashboard,
  patients,
  submitRequest,
  requests,
  accessibleRecords,
  accessHistory,
  profile,
  updateDoctorProfile,
  notifications,
  readNotification,
  readAllNotifications,
  uploadCertificate,
  certificateStatus,
  downloadMedicalRecordForDoctor,
};
