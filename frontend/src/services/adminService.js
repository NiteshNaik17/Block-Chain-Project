import api, { unwrap } from './api';

/**
 * Administrator portal API client (Phase 7).
 *
 * Every call targets /api/v1/admin/* through the shared Axios instance, so the
 * HttpOnly session cookie is sent automatically and no token is ever read from
 * or written to browser storage.
 *
 * No function here accepts an administrator id: the server always derives
 * identity and ownership from the authenticated session. Nothing in this module
 * touches a medical document, a decryption key or the blockchain.
 */

const ADMIN_BASE = '/v1/admin';

async function getData(path, config) {
  const body = unwrap(await api.get(path, config));
  return body.data;
}

async function patchData(path, payload) {
  const body = unwrap(await api.patch(path, payload));
  return body.data;
}

// --- Dashboard ---------------------------------------------------------------

/**
 * GET /api/v1/admin/dashboard
 * Returns { stats, recentActivity, generatedAt } sourced from MongoDB.
 */
export async function fetchDashboard() {
  return getData(`${ADMIN_BASE}/dashboard`);
}

// --- Patients ----------------------------------------------------------------

/** GET /api/v1/admin/patients - administrative profile fields only. */
export async function fetchPatients(params = {}) {
  return getData(`${ADMIN_BASE}/patients`, { params });
}

/** GET /api/v1/admin/patients/:id */
export async function fetchPatient(patientId) {
  return getData(`${ADMIN_BASE}/patients/${patientId}`);
}

// --- Doctor verification -----------------------------------------------------

/**
 * GET /api/v1/admin/doctors/pending
 *
 * The backend keeps `data` as a plain array with a sibling `counts` object for
 * backwards compatibility; `pagination` is returned alongside.
 */
export async function fetchPendingDoctors(params = {}) {
  const body = unwrap(await api.get(`${ADMIN_BASE}/doctors/pending`, { params }));
  return {
    doctors: body.data ?? [],
    counts: body.counts ?? { pending: 0, verified: 0, rejected: 0 },
    pagination: body.pagination ?? null,
  };
}

/** GET /api/v1/admin/doctors */
export async function fetchDoctors(params = {}) {
  return getData(`${ADMIN_BASE}/doctors`, { params });
}

/** GET /api/v1/admin/doctors/:id */
export async function fetchDoctor(doctorId) {
  return getData(`${ADMIN_BASE}/doctors/${doctorId}`);
}

/** PATCH /api/v1/admin/doctors/:id/approve */
export async function approveDoctor(id) {
  return patchData(`${ADMIN_BASE}/doctors/${id}/approve`);
}

/** PATCH /api/v1/admin/doctors/:id/reject */
export async function rejectDoctor(id, reason) {
  return patchData(`${ADMIN_BASE}/doctors/${id}/reject`, { reason });
}

// --- User management ---------------------------------------------------------

/** GET /api/v1/admin/users */
export async function fetchUsers(params = {}) {
  return getData(`${ADMIN_BASE}/users`, { params });
}

/** GET /api/v1/admin/users/:id */
export async function fetchUser(userId) {
  return getData(`${ADMIN_BASE}/users/${userId}`);
}

/** PATCH /api/v1/admin/users/:id/status - status is 'active' or 'suspended'. */
export async function updateUserStatus(userId, status) {
  return patchData(`${ADMIN_BASE}/users/${userId}/status`, { status });
}

// --- Activity logs (read-only) ----------------------------------------------

/** GET /api/v1/admin/activity-logs - paginated, filterable audit trail. */
export async function fetchActivityLogs(params = {}) {
  return getData(`${ADMIN_BASE}/activity-logs`, { params });
}

// --- Profile -----------------------------------------------------------------

/** GET /api/v1/admin/profile */
export async function fetchProfile() {
  const body = unwrap(await api.get(`${ADMIN_BASE}/profile`));
  return body.user;
}

/** PATCH /api/v1/admin/profile - only the server's editable allow-list. */
export async function updateProfile(payload) {
  const body = unwrap(await api.patch(`${ADMIN_BASE}/profile`, payload));
  return body.user;
}

// --- Notifications -----------------------------------------------------------

/** GET /api/v1/admin/notifications - scoped to the authenticated admin. */
export async function fetchNotifications(params = {}) {
  return getData(`${ADMIN_BASE}/notifications`, { params });
}

/** PATCH /api/v1/admin/notifications/:id/read */
export async function markNotificationRead(notificationId) {
  return patchData(`${ADMIN_BASE}/notifications/${notificationId}/read`);
}

/** PATCH /api/v1/admin/notifications/read-all */
export async function markAllNotificationsRead() {
  return patchData(`${ADMIN_BASE}/notifications/read-all`);
}

// --- API-shaped values used by the admin UI ----------------------------------
// These mirror the backend model enums exactly; the backend rejects anything else.

/** Mirrors User.ACCOUNT_STATUSES, with display labels. */
export const ACCOUNT_STATUS_LABELS = {
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
  rejected: 'Rejected',
};

export const ACCOUNT_STATUS_OPTIONS = Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => ({
  label,
  value,
}));

/** Mirrors User.USER_ROLES, with display labels. */
export const USER_ROLE_LABELS = { patient: 'Patient', doctor: 'Doctor', admin: 'Admin' };

export const USER_ROLE_OPTIONS = Object.entries(USER_ROLE_LABELS).map(([value, label]) => ({
  label,
  value,
}));

/** Mirrors User.VERIFICATION_STATUSES, with display labels. */
export const VERIFICATION_STATUS_LABELS = {
  not_applicable: 'Not applicable',
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const VERIFICATION_STATUS_OPTIONS = Object.entries(VERIFICATION_STATUS_LABELS).map(
  ([value, label]) => ({ label, value })
);

/** Mirrors ActivityLog.ACTOR_ROLES, with display labels. */
export const ACTOR_ROLE_LABELS = {
  patient: 'Patient',
  doctor: 'Doctor',
  admin: 'Admin',
  system: 'System',
};

export const ACTOR_ROLE_OPTIONS = Object.entries(ACTOR_ROLE_LABELS).map(([value, label]) => ({
  label,
  value,
}));

/**
 * Only an active / suspended account can be toggled through user management.
 * Returns the status a toggle would move the account to.
 */
export function toggledAccountStatus(current) {
  return current === 'suspended' ? 'active' : 'suspended';
}

/**
 * GET /api/v1/admin/doctors/:id/certificate
 * Decrypts in memory and triggers browser download of doctor's verification certificate.
 */
export async function downloadDoctorCertificate(doctorId, fallbackName = 'certificate.pdf') {
  const response = await api.get(`${ADMIN_BASE}/doctors/${doctorId}/certificate`, {
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
    type: response.headers['content-type'] || 'application/pdf',
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

const adminService = {
  fetchDashboard,
  fetchPatients,
  fetchPatient,
  fetchPendingDoctors,
  fetchDoctors,
  fetchDoctor,
  approveDoctor,
  rejectDoctor,
  downloadDoctorCertificate,
  fetchUsers,
  fetchUser,
  updateUserStatus,
  fetchActivityLogs,
  fetchProfile,
  updateProfile,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};

export default adminService;
