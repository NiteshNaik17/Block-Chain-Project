import api, { unwrap } from './api';

/**
 * Doctor portal API client (Phase 6).
 *
 * Every call targets /api/v1/doctor/* using the shared Axios instance, so the
 * HttpOnly session cookie is sent automatically and no token is ever read from
 * or written to browser storage.
 *
 * No function here accepts a doctor id: the server always derives ownership from
 * the authenticated session. Nothing in this module uploads, downloads, previews
 * or deletes a medical document, and nothing touches the blockchain - those
 * belong to Phases 8 and 9.
 */

const DOCTOR_BASE = '/v1/doctor';

async function getData(path, config) {
  const body = unwrap(await api.get(path, config));
  return body.data;
}

/** GET /api/v1/doctor/dashboard */
export async function fetchDashboard() {
  return getData(`${DOCTOR_BASE}/dashboard`);
}

/** GET /api/v1/doctor/patients - identifying information only. */
export async function fetchPatients(params = {}) {
  return getData(`${DOCTOR_BASE}/patients`, { params });
}

/**
 * POST /api/v1/doctor/requests
 *
 * Category-first: the doctor states the record categories needed plus a purpose
 * and duration. No record is named by the doctor and no consent is created - the
 * patient selects the actual records when they review the request.
 */
export async function createAccessRequest(payload) {
  const body = unwrap(await api.post(`${DOCTOR_BASE}/requests`, payload));
  return { request: body.data.request, message: body.message };
}

/** GET /api/v1/doctor/requests */
export async function fetchRequests(params = {}) {
  return getData(`${DOCTOR_BASE}/requests`, { params });
}

/** GET /api/v1/doctor/accessible-records */
export async function fetchAccessibleRecords(params = {}) {
  return getData(`${DOCTOR_BASE}/accessible-records`, { params });
}

/** GET /api/v1/doctor/access-history */
export async function fetchAccessHistory(params = {}) {
  return getData(`${DOCTOR_BASE}/access-history`, { params });
}

/** GET /api/v1/doctor/profile */
export async function fetchProfile() {
  const body = unwrap(await api.get(`${DOCTOR_BASE}/profile`));
  return body.user;
}

/** PATCH /api/v1/doctor/profile - only the server's allow-list is accepted. */
export async function updateProfile(payload) {
  const body = unwrap(await api.patch(`${DOCTOR_BASE}/profile`, payload));
  return body.user;
}

/** GET /api/v1/doctor/notifications */
export async function fetchNotifications(params = {}) {
  return getData(`${DOCTOR_BASE}/notifications`, { params });
}

/** PATCH /api/v1/doctor/notifications/:id/read */
export async function markNotificationRead(notificationId) {
  const body = unwrap(await api.patch(`${DOCTOR_BASE}/notifications/${notificationId}/read`));
  return body.data;
}

/** PATCH /api/v1/doctor/notifications/read-all */
export async function markAllNotificationsRead() {
  const body = unwrap(await api.patch(`${DOCTOR_BASE}/notifications/read-all`));
  return body.data;
}

// --- Doctor Verification Certificate (Phase 8) -------------------------------

/** POST /api/v1/doctor/certificate - multipart upload with AES-256-GCM encryption */
export async function uploadCertificate(file) {
  const formData = new FormData();
  formData.append('certificate', file);
  const body = unwrap(
    await api.post(`${DOCTOR_BASE}/certificate`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  );
  return body.data.certificate;
}

/** GET /api/v1/doctor/certificate - safe certificate upload status */
export async function fetchCertificateStatus() {
  const body = unwrap(await api.get(`${DOCTOR_BASE}/certificate`));
  return body.data.certificate;
}

// --- API-shaped values used by the doctor UI ---------------------------------
// These mirror the backend model enums exactly; the backend rejects anything else.

/** Mirrors MedicalRecord.RECORD_CATEGORIES / AccessRequest.requestedCategories. */
export const REQUEST_CATEGORIES = [
  'Prescription',
  'Laboratory Report',
  'X-ray Report',
  'MRI / CT Scan Report',
  'Discharge Summary',
  'Medical Certificate',
  'Other Document',
];

/** Duration choices offered by the doctor request form (within the 1-365 day range). */
export const REQUEST_DURATIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '1 year', value: 365 },
];

/** Mirrors AccessRequest.ACCESS_REQUEST_STATUSES, with display labels. */
export const REQUEST_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved (decision)',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const REQUEST_STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Cancelled', value: 'cancelled' },
];

/** GET /api/v1/doctor/records/:id/download - verified on-chain medical document streaming */
export async function downloadAccessibleRecord(recordId, fallbackFilename = 'medical-document') {
  const response = await api.get(`${DOCTOR_BASE}/records/${recordId}/download`, {
    responseType: 'blob',
  });

  const contentDisposition = response.headers['content-disposition'] || '';
  let filename = fallbackFilename;
  const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  if (match && match[1]) {
    filename = decodeURIComponent(match[1]);
  }

  const blob = new Blob([response.data], {
    type: response.headers['content-type'] || 'application/octet-stream',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  return { filename, size: blob.size };
}

const doctorService = {
  fetchDashboard,
  fetchPatients,
  createAccessRequest,
  fetchRequests,
  fetchAccessibleRecords,
  downloadAccessibleRecord,
  fetchAccessHistory,
  fetchProfile,
  updateProfile,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  uploadCertificate,
  fetchCertificateStatus,
};

export default doctorService;
