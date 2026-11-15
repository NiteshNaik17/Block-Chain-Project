import api, { unwrap } from './api';

/**
 * Patient portal API client (Phase 5).
 *
 * Every call targets /api/v1/patient/* using the shared Axios instance, so the
 * HttpOnly session cookie is sent automatically and no token is ever read from
 * or written to browser storage.
 *
 * No function here accepts a patient id: the server always derives ownership
 * from the authenticated session.
 *
 * Nothing in this module uploads, downloads, previews or deletes a medical
 * document, and nothing touches the blockchain - those belong to Phases 8/9.
 */

const PATIENT_BASE = '/v1/patient';

async function getData(path, config) {
  const body = unwrap(await api.get(path, config));
  return body.data;
}

/** GET /api/v1/patient/dashboard */
export async function fetchDashboard() {
  return getData(`${PATIENT_BASE}/dashboard`);
}

/** GET /api/v1/patient/records */
export async function fetchRecords(params = {}) {
  return getData(`${PATIENT_BASE}/records`, { params });
}

/** GET /api/v1/patient/records/:id */
export async function fetchRecord(recordId) {
  const body = unwrap(await api.get(`${PATIENT_BASE}/records/${recordId}`));
  return body.data.record;
}

/** POST /api/v1/patient/records - multipart upload with AES-256-GCM encryption */
export async function uploadMedicalRecord(formData) {
  const response = await api.post(`${PATIENT_BASE}/records`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const body = unwrap(response);
  return body.data.record;
}

/** GET /api/v1/patient/records/:id/download - downloads decrypted verified file */
export async function downloadMedicalRecord(recordId, fallbackName = 'record.pdf') {
  const response = await api.get(`${PATIENT_BASE}/records/${recordId}/download`, {
    responseType: 'blob',
  });

  let fileName = fallbackName;
  const disposition = response.headers['content-disposition'];
  if (disposition) {
    const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i);
    const rawName = filenameMatch?.[1] || filenameMatch?.[2] || filenameMatch?.[3];
    if (rawName) fileName = decodeURIComponent(rawName);
  }

  const blob = new Blob([response.data], {
    type: response.headers['content-type'] || 'application/octet-stream',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** GET /api/v1/patient/requests */
export async function fetchAccessRequests(params = {}) {
  return getData(`${PATIENT_BASE}/requests`, { params });
}

/**
 * PATCH /api/v1/patient/requests/:id/approve - records a decision only.
 *
 * `recordIds` (optional) carries the patient's OWN record selection for a
 * Phase 6 category-first request; the server validates every id for ownership.
 * No consent, file access or blockchain transaction is created.
 */
export async function approveAccessRequest(requestId, recordIds) {
  const body = unwrap(
    await api.patch(
      `${PATIENT_BASE}/requests/${requestId}/approve`,
      Array.isArray(recordIds) && recordIds.length > 0 ? { recordIds } : undefined
    )
  );
  return { request: body.data.request, message: body.message };
}

/** PATCH /api/v1/patient/requests/:id/reject */
export async function rejectAccessRequest(requestId, reason) {
  const body = unwrap(
    await api.patch(`${PATIENT_BASE}/requests/${requestId}/reject`, { reason })
  );
  return { request: body.data.request, message: body.message };
}

/** GET /api/v1/patient/consents */
export async function fetchConsents(params = {}) {
  return getData(`${PATIENT_BASE}/consents`, { params });
}

/** GET /api/v1/patient/consent-history */
export async function fetchConsentHistory(params = {}) {
  return getData(`${PATIENT_BASE}/consent-history`, { params });
}

/** GET /api/v1/patient/access-history */
export async function fetchAccessHistory(params = {}) {
  return getData(`${PATIENT_BASE}/access-history`, { params });
}

/** GET /api/v1/patient/profile */
export async function fetchProfile() {
  const body = unwrap(await api.get(`${PATIENT_BASE}/profile`));
  return body.user;
}

/** PATCH /api/v1/patient/profile - only the server's allow-list is accepted. */
export async function updateProfile(payload) {
  const body = unwrap(await api.patch(`${PATIENT_BASE}/profile`, payload));
  return body.user;
}

/** GET /api/v1/patient/notifications */
export async function fetchNotifications(params = {}) {
  return getData(`${PATIENT_BASE}/notifications`, { params });
}

/** PATCH /api/v1/patient/notifications/:id/read */
export async function markNotificationRead(notificationId) {
  return getData(`${PATIENT_BASE}/notifications/${notificationId}/read`);
}

/** PATCH /api/v1/patient/notifications/read-all */
export async function markAllNotificationsRead() {
  const body = unwrap(await api.patch(`${PATIENT_BASE}/notifications/read-all`));
  return body.data;
}

// --- API-shaped values used by the patient UI --------------------------------
// These mirror the Phase 3 model enums exactly; the backend rejects anything else.

/** Mirrors MedicalRecord.RECORD_CATEGORIES. */
export const RECORD_CATEGORIES = [
  'Prescription',
  'Laboratory Report',
  'X-ray Report',
  'MRI / CT Scan Report',
  'Discharge Summary',
  'Medical Certificate',
  'Other Document',
];

/** Mirrors MedicalRecord.RECORD_STATUSES. */
export const RECORD_STATUSES = ['active', 'archived', 'deleted'];

export const RECORD_STATUS_LABELS = {
  active: 'Active',
  archived: 'Archived',
  deleted: 'Deleted',
};

export const ENCRYPTION_STATUS_LABELS = {
  pending: 'Not encrypted yet',
  encrypted: 'Encrypted',
  failed: 'Encryption failed',
};

export const INTEGRITY_STATUS_LABELS = {
  pending: 'No digest recorded',
  recorded: 'Digest recorded',
};

/** Green/amber/red tone keys understood by StatusBadge. */
export const RECORD_STATUS_TONES = {
  active: 'success',
  archived: 'neutral',
  deleted: 'danger',
};

export const ENCRYPTION_STATUS_TONES = {
  pending: 'warning',
  encrypted: 'success',
  failed: 'danger',
};

export const INTEGRITY_STATUS_TONES = {
  pending: 'warning',
  recorded: 'success',
};

/** POST /api/v1/patient/consents/prepare - generates parameters for signing grant on-chain */
export async function prepareConsentGrant(payload) {
  const body = unwrap(await api.post(`${PATIENT_BASE}/consents/prepare`, payload));
  return body.data;
}

/** POST /api/v1/patient/consents/grant - synchronizes mined on-chain grant transaction */
export async function synchronizeConsentGrant(payload) {
  const body = unwrap(await api.post(`${PATIENT_BASE}/consents/grant`, payload));
  return body;
}

/** GET /api/v1/patient/consents/:id/revoke/prepare */
export async function prepareConsentRevocation(consentId) {
  const body = unwrap(await api.get(`${PATIENT_BASE}/consents/${consentId}/revoke/prepare`));
  return body.data;
}

/** POST /api/v1/patient/consents/:id/revoke - synchronizes mined on-chain revocation */
export async function synchronizeConsentRevocation(consentId, payload = {}) {
  const body = unwrap(await api.post(`${PATIENT_BASE}/consents/${consentId}/revoke`, payload));
  return body;
}

const patientService = {
  fetchDashboard,
  fetchRecords,
  fetchRecord,
  uploadMedicalRecord,
  downloadMedicalRecord,
  fetchAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  fetchConsents,
  prepareConsentGrant,
  synchronizeConsentGrant,
  prepareConsentRevocation,
  synchronizeConsentRevocation,
  fetchConsentHistory,
  fetchAccessHistory,
  fetchProfile,
  updateProfile,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};

export default patientService;
