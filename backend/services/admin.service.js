import mongoose from 'mongoose';

import AccessRequest from '../models/AccessRequest.js';
import ActivityLog, { ACTOR_ROLES } from '../models/ActivityLog.js';
import Consent from '../models/Consent.js';
import Notification from '../models/Notification.js';
import User, { ACCOUNT_STATUSES, USER_ROLES, VERIFICATION_STATUSES } from '../models/User.js';
import { recordActivity } from './activity.service.js';
import { httpError, toSafeCertificate, toSafeUser } from './auth.service.js';
import { parsePagination, toSafeNotification } from './patient.service.js';
import { readVerifiedFile } from './secureFile.service.js';
import { isStorageReference } from '../utils/privateStorage.js';

/**
 * Administrator service (Phase 7).
 *
 * Every function takes the AUTHENTICATED administrator's database id as its
 * first argument. An admin id supplied by the client is never read, so it can
 * never influence ownership, and a session scoped to one admin can never read
 * or mutate another administrator's data.
 *
 * Privacy boundaries enforced here:
 *  - an administrator sees ACCOUNT / verification metadata only - never a
 *    medical record, diagnosis, document reference or storage path;
 *  - every response is built from an explicit allow-list serialiser, so a new
 *    field added to a model can never leak through these endpoints;
 *  - Phase 8 adds exactly one document route: an administrator may view the
 *    encrypted VERIFICATION CERTIFICATE of a doctor under review. That read is
 *    decrypted in memory, integrity-checked and audited. No medical record is
 *    reachable from this router.
 */

const RECENT_LIMIT = 6;

/** Fields an administrator may never change through the profile endpoint. */
export const PROTECTED_ADMIN_FIELDS = [
  'email',
  'role',
  'accountStatus',
  'verificationStatus',
  'passwordHash',
  'password',
  'walletAddress',
  'medicalRegistrationNumber',
  'specialization',
  'hospitalName',
  'certificateFileReference',
  'verifiedAt',
  'verifiedBy',
  'verificationReason',
  'createdAt',
  'updatedAt',
];

/** Fields an administrator may update through the profile endpoint. */
export const EDITABLE_ADMIN_FIELDS = ['fullName', 'mobileNumber'];

/**
 * Forbidden metadata keys mirrored from the ActivityLog write guard.
 * Applied again on read as defence in depth so a legacy document could never
 * surface a credential even if its write-time guard was bypassed.
 */
const FORBIDDEN_METADATA_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'privatekey',
  'authorization',
  'encryptionkey',
  'masterencryptionkey',
];

// Account statuses an administrator can move a user between through user
// management. Nothing else is accepted.
const SETTABLE_STATUSES = ['active', 'suspended'];

// --- small helpers -----------------------------------------------------------

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paginationMeta({ page, limit }, total) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasMore: page * limit < total };
}

function parseDateBoundary(value, endOfDay = false) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, 'Invalid date filter', 'INVALID_DATE_FILTER');
  }
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  else if (!String(value).includes('T')) date.setUTCHours(0, 0, 0, 0);
  return date;
}

function notFound(message, code) {
  return httpError(404, message, code);
}

function allowedSortField(query = {}, allowed = ['createdAt']) {
  const requested = String(query.sortBy ?? '').trim();
  return allowed.includes(requested) ? requested : allowed[0];
}

function buildSort(query = {}, allowed = ['createdAt']) {
  const field = allowedSortField(query, allowed);
  const direction = String(query.sortOrder ?? '').toLowerCase() === 'asc' ? 1 : -1;
  return { [field]: direction, _id: direction };
}

function countsFromRows(rows) {
  const map = {};
  for (const row of rows) {
    map[row._id ?? 'unknown'] = row.count;
  }
  return map;
}

/**
 * Best-effort in-app notification. A notification failure must never take down
 * the administrative action that triggered it.
 */
async function notifyUser(userId, payload) {
  try {
    await Notification.create({ recipientId: userId, ...payload });
  } catch (error) {
    console.error('[MediConsent] Failed to create notification:', error.message);
  }
}

// --- serialisers (allow-list only; never a raw document) ---------------------

/**
 * Administrative view of a patient account.
 * Deliberately excludes medical records, prescriptions, diagnoses, lab reports,
 * file paths, encryption details and emergency medical information.
 */
export function toSafePatientAdmin(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    fullName: user.fullName ?? 'Unknown patient',
    email: user.email ?? null,
    mobileNumber: user.mobileNumber ?? null,
    role: 'patient',
    accountStatus: user.accountStatus,
    registeredAt: user.createdAt ?? null,
  };
}

/** Administrative view of a doctor account, including verification metadata. */
export function toSafeDoctorAdmin(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    fullName: user.fullName ?? 'Unknown doctor',
    email: user.email ?? null,
    mobileNumber: user.mobileNumber ?? null,
    role: 'doctor',
    medicalRegistrationNumber: user.medicalRegistrationNumber ?? null,
    specialization: user.specialization ?? null,
    hospitalName: user.hospitalName ?? null,
    accountStatus: user.accountStatus,
    verificationStatus: user.verificationStatus,
    verifiedAt: user.verifiedAt ?? null,
    verificationReason: user.verificationReason ?? null,
    verifiedBy: user.verifiedBy ? String(user.verifiedBy) : null,
    // Safe certificate metadata only (upload state, display name, review
    // status). The verification UI needs to know whether a certificate exists
    // before an administrator opens it.
    certificate: toSafeCertificate(user),
    registeredAt: user.createdAt ?? null,
  };
}

/** Generic administrative view of any account (used by Manage Users). */
export function toSafeUserAdmin(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    fullName: user.fullName ?? 'Unknown user',
    email: user.email ?? null,
    mobileNumber: user.mobileNumber ?? null,
    role: user.role,
    accountStatus: user.accountStatus,
    verificationStatus: user.verificationStatus,
    registeredAt: user.createdAt ?? null,
  };
}

/**
 * Surface only shallow, primitive-safe metadata. Nested documents, buffers and
 * any credential-shaped key are dropped rather than forwarded to the client.
 */
function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

  const safe = {};
  let count = 0;

  for (const [key, value] of Object.entries(metadata)) {
    if (count >= 12) break;
    if (FORBIDDEN_METADATA_KEYS.includes(String(key).toLowerCase())) continue;
    if (value == null) continue;

    const type = typeof value;
    if (type === 'string') {
      safe[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
    } else if (type === 'number' || type === 'boolean') {
      safe[key] = value;
    } else if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      safe[key] = value.slice(0, 20);
    } else {
      continue;
    }
    count += 1;
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

/** Allow-listed audit entry. Never returns a raw ActivityLog document. */
export function toSafeActivityLog(entry) {
  if (!entry) return null;
  const actor = entry.actorId && typeof entry.actorId === 'object' ? entry.actorId : null;

  return {
    id: String(entry._id),
    actorId: actor ? String(actor._id) : entry.actorId ? String(entry.actorId) : null,
    actorName: actor?.fullName ?? null,
    actorRole: entry.actorRole,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ? String(entry.targetId) : null,
    description: entry.description,
    metadata: sanitizeMetadata(entry.metadata),
    timestamp: entry.timestamp ?? null,
  };
}

// --- dashboard ---------------------------------------------------------------

/** GET /api/v1/admin/dashboard */
export async function getDashboard() {
  const now = new Date();

  const [userFacet, requestStatusRows, activeConsents, recentActivity] = await Promise.all([
    User.aggregate([
      {
        $facet: {
          byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }],
          byAccountStatus: [{ $group: { _id: '$accountStatus', count: { $sum: 1 } } }],
          doctorVerification: [
            { $match: { role: 'doctor' } },
            { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    AccessRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Consent.countDocuments({ status: 'active', expiresAt: { $gt: now } }),
    ActivityLog.find({})
      .sort({ timestamp: -1, _id: -1 })
      .limit(RECENT_LIMIT)
      .populate('actorId', 'fullName role')
      .lean(),
  ]);

  const facet = userFacet[0] ?? {};
  const byRole = countsFromRows(facet.byRole ?? []);
  const byAccountStatus = countsFromRows(facet.byAccountStatus ?? []);
  const byVerification = countsFromRows(facet.doctorVerification ?? []);
  const requestCounts = countsFromRows(requestStatusRows);

  const totalRequests = requestStatusRows.reduce((sum, row) => sum + row.count, 0);

  return {
    stats: {
      totalPatients: byRole.patient ?? 0,
      totalDoctors: byRole.doctor ?? 0,
      verifiedDoctors: byVerification.verified ?? 0,
      pendingDoctorVerifications: byVerification.pending ?? 0,
      rejectedDoctors: byVerification.rejected ?? 0,
      activeUsers: byAccountStatus.active ?? 0,
      suspendedUsers: byAccountStatus.suspended ?? 0,
      totalAccessRequests: totalRequests,
      pendingAccessRequests: requestCounts.pending ?? 0,
      approvedAccessRequests: requestCounts.approved ?? 0,
      rejectedAccessRequests: requestCounts.rejected ?? 0,
      activeConsents,
    },
    recentActivity: recentActivity.map(toSafeActivityLog),
    generatedAt: now.toISOString(),
  };
}

// --- patient directory -------------------------------------------------------

/** GET /api/v1/admin/patients */
export async function listPatients(query = {}) {
  const pagination = parsePagination(query);
  const filter = { role: 'patient' };

  const status = String(query.accountStatus ?? query.status ?? '').trim();
  if (status) {
    if (!ACCOUNT_STATUSES.includes(status)) {
      throw httpError(400, 'Unsupported account status filter', 'INVALID_ACCOUNT_STATUS');
    }
    filter.accountStatus = status;
  }

  const search = String(query.search ?? '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const sortBy = allowedSortField(query, ['createdAt', 'fullName', 'email', 'accountStatus']);
  const sort = buildSort(query, ['createdAt', 'fullName', 'email', 'accountStatus']);

  const [patients, total, statusRows] = await Promise.all([
    User.find(filter)
      // Explicit allow-list projection: a future clinical field can never leak.
      .select('fullName email mobileNumber accountStatus role createdAt')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    User.countDocuments(filter),
    User.aggregate([{ $match: { role: 'patient' } }, { $group: { _id: '$accountStatus', count: { $sum: 1 } } }]),
  ]);

  const statusCounts = countsFromRows(statusRows);

  return {
    patients: patients.map(toSafePatientAdmin),
    counts: {
      total: statusRows.reduce((sum, row) => sum + row.count, 0),
      active: statusCounts.active ?? 0,
      suspended: statusCounts.suspended ?? 0,
    },
    pagination: paginationMeta(pagination, total),
    filters: {
      search: search || null,
      accountStatus: status || null,
      sortBy,
      sortOrder: String(query.sortOrder ?? '').toLowerCase() === 'asc' ? 'asc' : 'desc',
    },
  };
}

/** GET /api/v1/admin/patients/:id */
export async function getPatient(patientId) {
  if (!mongoose.isValidObjectId(patientId)) {
    throw httpError(400, 'Invalid patient id', 'INVALID_PATIENT_ID');
  }

  const patient = await User.findOne({ _id: patientId, role: 'patient' })
    .select('fullName email mobileNumber accountStatus role createdAt')
    .lean();

  if (!patient) throw notFound('Patient not found', 'PATIENT_NOT_FOUND');

  return toSafePatientAdmin(patient);
}

// --- doctor verification -----------------------------------------------------

async function findDoctor(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, 'Invalid doctor id', 'INVALID_DOCTOR_ID');
  }

  const doctor = await User.findOne({ _id: id, role: 'doctor' });
  if (!doctor) throw notFound('Doctor not found', 'DOCTOR_NOT_FOUND');

  return doctor;
}

/**
 * A doctor application may only be reviewed while it is pending. A patient id
 * can never be approved as a doctor because the role is checked above.
 */
async function findPendingDoctor(id) {
  const doctor = await findDoctor(id);

  if (doctor.verificationStatus !== 'pending') {
    throw httpError(
      409,
      `This application has already been processed (${doctor.verificationStatus}).`,
      'APPLICATION_ALREADY_PROCESSED'
    );
  }

  return doctor;
}

/** GET /api/v1/admin/doctors/pending */
export async function listPendingDoctors(query = {}) {
  const pagination = parsePagination(query);
  const filter = { role: 'doctor', verificationStatus: 'pending' };

  const search = String(query.search ?? '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }, { medicalRegistrationNumber: rx }];
  }

  const [pending, total, verified, rejected] = await Promise.all([
    User.find(filter)
      .select('fullName email mobileNumber medicalRegistrationNumber specialization hospitalName accountStatus verificationStatus verifiedAt verificationReason verifiedBy createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    User.countDocuments(filter),
    User.countDocuments({ role: 'doctor', verificationStatus: 'verified' }),
    User.countDocuments({ role: 'doctor', verificationStatus: 'rejected' }),
  ]);

  return {
    doctors: pending.map(toSafeDoctorAdmin),
    counts: { pending: total, verified, rejected },
    pagination: paginationMeta(pagination, total),
  };
}

/** GET /api/v1/admin/doctors */
export async function listDoctors(query = {}) {
  const pagination = parsePagination(query);
  const filter = { role: 'doctor' };

  const verificationStatus = String(query.verificationStatus ?? query.status ?? '').trim();
  if (verificationStatus) {
    if (!VERIFICATION_STATUSES.includes(verificationStatus)) {
      throw httpError(400, 'Unsupported verification status filter', 'INVALID_VERIFICATION_STATUS');
    }
    filter.verificationStatus = verificationStatus;
  }

  const search = String(query.search ?? '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }, { medicalRegistrationNumber: rx }];
  }

  const sort = buildSort(query, ['createdAt', 'fullName', 'verificationStatus']);

  const [doctors, total, verificationRows] = await Promise.all([
    User.find(filter)
      .select('fullName email mobileNumber medicalRegistrationNumber specialization hospitalName accountStatus verificationStatus verifiedAt verificationReason verifiedBy createdAt')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    User.countDocuments(filter),
    User.aggregate([{ $match: { role: 'doctor' } }, { $group: { _id: '$verificationStatus', count: { $sum: 1 } } }]),
  ]);

  const verificationCounts = countsFromRows(verificationRows);

  return {
    doctors: doctors.map(toSafeDoctorAdmin),
    counts: {
      total: verificationRows.reduce((sum, row) => sum + row.count, 0),
      pending: verificationCounts.pending ?? 0,
      verified: verificationCounts.verified ?? 0,
      rejected: verificationCounts.rejected ?? 0,
    },
    pagination: paginationMeta(pagination, total),
    filters: { search: search || null, verificationStatus: verificationStatus || null },
  };
}

/** GET /api/v1/admin/doctors/:id */
export async function getDoctor(doctorId) {
  const doctor = await findDoctor(doctorId);
  return toSafeDoctorAdmin(doctor.toObject());
}

/**
 * PATCH /api/v1/admin/doctors/:id/approve
 *
 * Only a pending doctor application can be approved, so a repeated or invalid
 * transition is rejected. The reviewing administrator is recorded on the user
 * document, in the audit trail, and is notified to the doctor.
 */
export async function approveDoctor(adminId, doctorId) {
  const doctor = await findPendingDoctor(doctorId);

  doctor.verificationStatus = 'verified';
  doctor.accountStatus = 'active';
  doctor.verifiedAt = new Date();
  doctor.verifiedBy = adminId;
  doctor.verificationReason = null;
  await doctor.save();

  await recordActivity({
    actorId: adminId,
    actorRole: 'admin',
    action: 'doctor.approved',
    description: `Doctor application approved for ${doctor.fullName}`,
    targetType: 'User',
    targetId: doctor._id,
    metadata: { verificationStatus: 'verified' },
  });

  await notifyUser(doctor._id, {
    title: 'Your account has been verified',
    message: 'An administrator verified your medical registration. You can now access the doctor portal.',
    notificationType: 'doctor_verified',
    relatedEntityType: 'User',
    relatedEntityId: doctor._id,
  });

  return toSafeUser(doctor);
}

/**
 * PATCH /api/v1/admin/doctors/:id/reject
 *
 * A rejection reason is mandatory. The reason is stored on the user document and
 * in the audit trail (a non-credential field) and the doctor is notified.
 */
export async function rejectDoctor(adminId, doctorId, reason) {
  const trimmedReason = String(reason ?? '').trim();
  if (!trimmedReason) {
    throw httpError(400, 'A rejection reason is required', 'REJECTION_REASON_REQUIRED');
  }

  const doctor = await findPendingDoctor(doctorId);

  doctor.verificationStatus = 'rejected';
  doctor.accountStatus = 'rejected';
  doctor.verifiedAt = new Date();
  doctor.verifiedBy = adminId;
  doctor.verificationReason = trimmedReason;
  await doctor.save();

  await recordActivity({
    actorId: adminId,
    actorRole: 'admin',
    action: 'doctor.rejected',
    description: `Doctor application rejected for ${doctor.fullName}`,
    targetType: 'User',
    targetId: doctor._id,
    // `reason` is not a forbidden key - no credentials can be stored here.
    metadata: { verificationStatus: 'rejected', reason: trimmedReason },
  });

  await notifyUser(doctor._id, {
    title: 'Verification decision',
    message: `Your doctor application was not approved: ${trimmedReason}`,
    notificationType: 'doctor_rejected',
    relatedEntityType: 'User',
    relatedEntityId: doctor._id,
  });

  return toSafeUser(doctor);
}

// --- user management ---------------------------------------------------------

/** GET /api/v1/admin/users */
export async function listUsers(query = {}) {
  const pagination = parsePagination(query);
  const filter = {};

  const role = String(query.role ?? '').trim();
  if (role) {
    if (!USER_ROLES.includes(role)) {
      throw httpError(400, 'Unsupported role filter', 'INVALID_ROLE');
    }
    filter.role = role;
  }

  const status = String(query.accountStatus ?? query.status ?? '').trim();
  if (status) {
    if (!ACCOUNT_STATUSES.includes(status)) {
      throw httpError(400, 'Unsupported account status filter', 'INVALID_ACCOUNT_STATUS');
    }
    filter.accountStatus = status;
  }

  const search = String(query.search ?? '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const sort = buildSort(query, ['createdAt', 'fullName', 'email', 'role', 'accountStatus']);

  const [users, total, roleRows, statusRows] = await Promise.all([
    User.find(filter)
      .select('fullName email mobileNumber role accountStatus verificationStatus createdAt')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    User.countDocuments(filter),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: '$accountStatus', count: { $sum: 1 } } }]),
  ]);

  const roleCounts = countsFromRows(roleRows);
  const statusCounts = countsFromRows(statusRows);

  return {
    users: users.map(toSafeUserAdmin),
    counts: {
      total: roleRows.reduce((sum, row) => sum + row.count, 0),
      byRole: { patient: roleCounts.patient ?? 0, doctor: roleCounts.doctor ?? 0, admin: roleCounts.admin ?? 0 },
      byStatus: {
        active: statusCounts.active ?? 0,
        pending: statusCounts.pending ?? 0,
        suspended: statusCounts.suspended ?? 0,
        rejected: statusCounts.rejected ?? 0,
      },
    },
    pagination: paginationMeta(pagination, total),
    filters: { search: search || null, role: role || null, accountStatus: status || null },
  };
}

/** GET /api/v1/admin/users/:id */
export async function getUser(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw httpError(400, 'Invalid user id', 'INVALID_USER_ID');
  }

  const user = await User.findById(userId)
    .select('fullName email mobileNumber role accountStatus verificationStatus createdAt')
    .lean();

  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');

  return toSafeUserAdmin(user);
}

/**
 * PATCH /api/v1/admin/users/:id/status
 *
 * Only an ACTIVE or SUSPENDED patient / doctor can be moved between those two
 * states. Administrators cannot target their own account or another
 * administrator, roles can never be changed, and the verification status is
 * left untouched. The transition is audited and the affected user notified.
 */
export async function updateUserStatus(adminId, userId, payload = {}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw httpError(400, 'Invalid user id', 'INVALID_USER_ID');
  }

  // Role / verification changes are explicitly refused rather than ignored.
  const forbidden = ['role', 'verificationStatus', 'email', 'password', 'passwordHash'].filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );
  if (forbidden.length > 0) {
    throw httpError(400, `"${forbidden[0]}" cannot be changed through this endpoint`, 'PROTECTED_FIELD');
  }

  const status = String(payload.status ?? '').trim();
  if (!SETTABLE_STATUSES.includes(status)) {
    throw httpError(400, 'Requested status must be one of: active, suspended', 'INVALID_STATUS_TRANSITION');
  }

  const user = await User.findById(userId);
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');

  if (String(user._id) === String(adminId)) {
    throw httpError(403, 'You cannot change the status of your own account', 'CANNOT_MODIFY_SELF');
  }
  if (user.role === 'admin') {
    throw httpError(
      403,
      'Administrator accounts cannot be modified through user management',
      'CANNOT_MODIFY_ADMIN'
    );
  }
  if (!SETTABLE_STATUSES.includes(user.accountStatus)) {
    throw httpError(
      409,
      `An account that is ${user.accountStatus} cannot be ${status}.`,
      'INVALID_STATUS_TRANSITION'
    );
  }
  if (user.accountStatus === status) {
    throw httpError(409, `This account is already ${status}.`, 'STATUS_UNCHANGED');
  }

  user.accountStatus = status;
  // Verification status is deliberately left untouched.
  await user.save();

  const action = `${user.role}.${status === 'suspended' ? 'suspended' : 'reactivated'}`;
  await recordActivity({
    actorId: adminId,
    actorRole: 'admin',
    action,
    description: `${user.role === 'doctor' ? 'Doctor' : 'Patient'} account ${status} for ${user.fullName}`,
    targetType: 'User',
    targetId: user._id,
    metadata: { accountStatus: status, role: user.role },
  });

  await notifyUser(user._id, {
    title: status === 'suspended' ? 'Your account has been suspended' : 'Your account has been reactivated',
    message:
      status === 'suspended'
        ? 'An administrator suspended your MediConsent account. Please contact support for assistance.'
        : 'An administrator reactivated your MediConsent account. You can sign in again.',
    notificationType: 'system',
    relatedEntityType: 'User',
    relatedEntityId: user._id,
  });

  return toSafeUserAdmin(user.toObject());
}

// --- activity logs (read-only audit trail) -----------------------------------

/**
 * GET /api/v1/admin/activity-logs
 *
 * Read-only. The audit trail is append-only: there is deliberately no create,
 * update or delete route, so an administrator can never rewrite history.
 */
export async function listActivityLogs(query = {}) {
  const pagination = parsePagination(query);
  const filter = {};

  const action = String(query.action ?? '').trim();
  if (action) filter.action = action;

  const actorRole = String(query.actorRole ?? '').trim();
  if (actorRole) {
    if (!ACTOR_ROLES.includes(actorRole)) {
      throw httpError(400, 'Unsupported actor role filter', 'INVALID_ACTOR_ROLE');
    }
    filter.actorRole = actorRole;
  }

  const from = parseDateBoundary(query.from);
  const to = parseDateBoundary(query.to, true);
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = from;
    if (to) filter.timestamp.$lte = to;
  }

  const search = String(query.search ?? '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ action: rx }, { description: rx }, { targetType: rx }];
  }

  const [logs, total, actionRows] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('actorId', 'fullName role')
      .lean(),
    ActivityLog.countDocuments(filter),
    ActivityLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
  ]);

  return {
    logs: logs.map(toSafeActivityLog),
    counts: {
      total: actionRows.reduce((sum, row) => sum + row.count, 0),
      byAction: actionRows.map((row) => ({ action: row._id, count: row.count })),
    },
    pagination: paginationMeta(pagination, total),
    filters: {
      search: search || null,
      action: action || null,
      actorRole: actorRole || null,
      from: query.from ?? null,
      to: query.to ?? null,
    },
  };
}

// --- profile -----------------------------------------------------------------

/** GET /api/v1/admin/profile */
export async function getProfile(adminId) {
  const user = await User.findOne({ _id: adminId, role: 'admin' });
  if (!user) throw notFound('Administrator profile not found', 'PROFILE_NOT_FOUND');
  return toSafeUser(user);
}

/**
 * PATCH /api/v1/admin/profile
 *
 * Only a full name and a mobile number may change. Email, role, account status
 * and administrative privileges are rejected explicitly rather than silently
 * ignored, so a client can never believe a protected change succeeded.
 */
export async function updateProfile(adminId, payload = {}) {
  const provided = Object.keys(payload ?? {});
  const protectedAttempt = provided.filter((field) => PROTECTED_ADMIN_FIELDS.includes(field));
  if (protectedAttempt.length > 0) {
    const field = protectedAttempt[0];
    const code = field === 'email' ? 'EMAIL_CHANGE_NOT_SUPPORTED' : 'PROTECTED_FIELD';
    throw httpError(400, `"${field}" cannot be changed through this endpoint`, code);
  }

  const updates = {};
  for (const field of EDITABLE_ADMIN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      updates[field] = payload[field] === '' ? null : payload[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw httpError(400, 'No updatable profile fields were provided', 'NO_UPDATABLE_FIELDS');
  }

  if (updates.fullName !== undefined && !String(updates.fullName ?? '').trim()) {
    throw httpError(400, 'Full name is required', 'FULL_NAME_REQUIRED');
  }
  if (updates.mobileNumber !== undefined && !String(updates.mobileNumber ?? '').trim()) {
    throw httpError(400, 'Mobile number is required', 'MOBILE_NUMBER_REQUIRED');
  }

  const user = await User.findByIdAndUpdate(
    adminId,
    { $set: updates },
    { new: true, runValidators: true, context: 'query' }
  );
  if (!user) throw notFound('Administrator profile not found', 'PROFILE_NOT_FOUND');

  await recordActivity({
    actorId: adminId,
    actorRole: 'admin',
    action: 'admin.profile_updated',
    description: `Administrator updated profile fields: ${Object.keys(updates).join(', ')}`,
    targetType: 'User',
    targetId: user._id,
    // Field names only - no values, no credentials.
    metadata: { fields: Object.keys(updates) },
  });

  return toSafeUser(user);
}

// --- notifications -----------------------------------------------------------

/** GET /api/v1/admin/notifications */
export async function listNotifications(adminId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { recipientId: adminId };

  const unreadOnly = String(query.unread ?? '').toLowerCase();
  if (unreadOnly === 'true' || unreadOnly === '1') filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientId: adminId, isRead: false }),
  ]);

  return {
    notifications: notifications.map(toSafeNotification),
    unreadCount,
    pagination: paginationMeta(pagination, total),
  };
}

/** PATCH /api/v1/admin/notifications/:id/read */
export async function markNotificationRead(adminId, notificationId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw httpError(400, 'Invalid notification id', 'INVALID_NOTIFICATION_ID');
  }

  // Scoped by recipientId: another user's notification is a 404, never a 403
  // that would confirm the id exists.
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: adminId },
    { $set: { isRead: true } },
    { new: true }
  ).lean();

  if (!notification) throw notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');

  const unreadCount = await Notification.countDocuments({ recipientId: adminId, isRead: false });
  return { notification: toSafeNotification(notification), unreadCount };
}

/** PATCH /api/v1/admin/notifications/read-all */
export async function markAllNotificationsRead(adminId) {
  const result = await Notification.updateMany(
    { recipientId: adminId, isRead: false },
    { $set: { isRead: true } }
  );
  return { updated: result.modifiedCount ?? 0, unreadCount: 0 };
}

// --- Doctor Verification Certificate Review (Phase 8) ------------------------

/**
 * GET /api/v1/admin/doctors/:id/certificate
 *
 * Decrypts in memory and returns a doctor's verification certificate for review.
 * Scoped to authorized administrators and audited in ActivityLog.
 */
export async function getDoctorCertificateDocument(adminId, doctorId) {
  const doctor = await findDoctor(doctorId);

  if (
    !doctor.certificateFileReference ||
    !doctor.certificateMetadata?.integrityHash ||
    !isStorageReference(doctor.certificateFileReference)
  ) {
    throw httpError(404, 'No verification certificate is available for this doctor.', 'CERTIFICATE_NOT_AVAILABLE');
  }

  const buffer = await readVerifiedFile({
    fileReference: doctor.certificateFileReference,
    encryptionIv: doctor.certificateMetadata.encryptionIv,
    authTag: doctor.certificateMetadata.authTag,
    integrityHash: doctor.certificateMetadata.integrityHash,
  });

  await recordActivity({
    actorId: adminId,
    actorRole: 'admin',
    action: 'doctor_certificate.viewed',
    description: `Admin viewed verification certificate for ${doctor.fullName}.`,
    targetType: 'User',
    targetId: doctor._id,
    metadata: { result: 'granted', integrity: 'verified' },
  });

  return {
    buffer,
    fileName: doctor.certificateMetadata.originalFileName || `certificate-${doctor._id}.pdf`,
    mimeType: doctor.certificateMetadata.mimeType || 'application/pdf',
  };
}

export default {
  PROTECTED_ADMIN_FIELDS,
  EDITABLE_ADMIN_FIELDS,
  toSafePatientAdmin,
  toSafeDoctorAdmin,
  toSafeUserAdmin,
  toSafeActivityLog,
  getDashboard,
  listPatients,
  getPatient,
  listPendingDoctors,
  listDoctors,
  getDoctor,
  approveDoctor,
  rejectDoctor,
  listUsers,
  getUser,
  updateUserStatus,
  listActivityLogs,
  getProfile,
  updateProfile,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getDoctorCertificateDocument,
};
