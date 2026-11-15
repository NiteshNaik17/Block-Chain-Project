import mongoose from 'mongoose';

import AccessLog from '../models/AccessLog.js';
import AccessRequest, { ACCESS_REQUEST_STATUSES } from '../models/AccessRequest.js';
import ActivityLog from '../models/ActivityLog.js';
import Consent from '../models/Consent.js';
import MedicalRecord, { RECORD_CATEGORIES } from '../models/MedicalRecord.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { recordActivity } from './activity.service.js';
import { httpError, toSafeCertificate, toSafeUser } from './auth.service.js';
import { parsePagination, toSafeNotification } from './patient.service.js';
import { validateUploadedFile } from '../utils/fileValidation.js';
import { readVerifiedFile, removeEncryptedFile, storeEncryptedFile } from './secureFile.service.js';
import { checkLiveOnChainConsent } from './blockchain.service.js';
import env from '../config/env.js';

/**
 * Doctor portal service (Phase 6).
 *
 * Every function takes the AUTHENTICATED doctor's database id as its first
 * argument and scopes every query to it. A doctor id supplied by the client is
 * never read, so it can never influence ownership.
 *
 * Patient privacy boundaries enforced here:
 *  - the patient directory returns identifying fields only - never a record,
 *    diagnosis, document reference or storage path;
 *  - a doctor submits a request by CATEGORY - the doctor is never given a list
 *    of a patient's records to choose from;
 *  - accessible records require a genuine, active, unexpired, blockchain-backed
 *    consent - never an approved request;
 *  - nothing here creates a Consent, signs a transaction, or returns a file
 *    reference (Phases 8 and 9).
 */

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const RECENT_LIMIT = 5;
const ACTIVITY_LIMIT = 6;
const TREND_MONTHS = 6;
const SEARCH_PATIENT_LIMIT = 200;
const CONSENT_SCAN_LIMIT = 200;

const PATIENT_POPULATE = 'fullName email';
const REQUEST_RECORD_POPULATE = 'recordTitle category reportDate recordStatus patientId';
const ACCESSIBLE_RECORD_POPULATE =
  'recordTitle category reportDate recordStatus patientId hospitalName doctorName';

/** Fields a doctor may never change through the profile endpoint. */
export const PROTECTED_DOCTOR_FIELDS = [
  'email',
  'role',
  'accountStatus',
  'verificationStatus',
  'passwordHash',
  'password',
  'walletAddress',
  'medicalRegistrationNumber',
  'certificateFileReference',
  'verifiedAt',
  'verificationReason',
  'createdAt',
  'updatedAt',
];

/** Fields a doctor may update through the profile endpoint. */
export const EDITABLE_DOCTOR_FIELDS = [
  'fullName',
  'mobileNumber',
  'specialization',
  'hospitalName',
  'profilePhoto',
];

// --- small helpers -----------------------------------------------------------

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
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

/** Coarse age band derived server-side so a date of birth is never exposed. */
function ageBandFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  if (age < 0) return null;
  if (age < 18) return 'Under 18';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65+';
}

// --- serialisers (allow-list only; never a raw document) ---------------------

/**
 * Minimum identifying information about a patient.
 * Deliberately excludes medical records, clinical data, document references and
 * any unnecessary private detail (address, emergency contact, date of birth).
 */
export function toSafePatientSummary(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    fullName: user.fullName ?? 'Unknown patient',
    email: user.email ?? null,
    ageBand: ageBandFrom(user.dateOfBirth),
    registeredAt: user.createdAt ?? null,
  };
}

function toSelectedRecordSummary(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    id: String(record._id),
    recordTitle: record.recordTitle,
    category: record.category ?? null,
    reportDate: record.reportDate ?? null,
    recordStatus: record.recordStatus ?? 'active',
  };
}

/**
 * Doctor-facing view of an access request the doctor raised.
 *
 * Shows the categories that were requested and, once the patient has decided,
 * which of their OWN records they chose to share. Only a title/category/date
 * summary is ever surfaced - never a storage reference or download path.
 * `blockchainBacked` is always false in this phase: an approved request is the
 * patient's recorded decision only, not an on-chain authorization.
 */
export function toSafeDoctorRequest(request) {
  if (!request) return null;
  const selectedRecords = (request.requestedRecords ?? [])
    .map(toSelectedRecordSummary)
    .filter(Boolean);

  return {
    id: String(request._id),
    patient: toSafePatientSummary(request.patientId),
    requestedCategories: Array.isArray(request.requestedCategories) ? request.requestedCategories : [],
    selectedRecords,
    selectedRecordCount: selectedRecords.length,
    purpose: request.purpose,
    requestedDuration: request.requestedDuration,
    status: request.status,
    requestedAt: request.createdAt ?? null,
    responseDate: request.patientResponseDate ?? null,
    rejectionReason: request.rejectionReason ?? null,
    patientDecision: request.status === 'pending' ? null : request.status,
    // An approved request is a recorded patient decision, never a blockchain
    // authorization (that is Phase 9).
    authorizationType: 'recorded_decision',
    grantedOnChain: false,
    blockchainBacked: false,
  };
}

function toSafeDoctorAccessLog(entry) {
  if (!entry) return null;
  const record = entry.medicalRecordId;
  return {
    id: String(entry._id),
    patient: toSafePatientSummary(entry.patientId),
    record:
      record && typeof record === 'object'
        ? {
            id: String(record._id),
            recordTitle: record.recordTitle,
            category: record.category ?? null,
          }
        : null,
    accessedAt: entry.accessedAt ?? null,
    accessResult: entry.accessResult,
    reason: entry.reason ?? null,
  };
}

// --- dashboard ---------------------------------------------------------------

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildRequestTrend(rows, months = TREND_MONTHS) {
  const requests = new Map();
  const approved = new Map();

  for (const row of rows) {
    const key = row._id.month;
    requests.set(key, (requests.get(key) ?? 0) + row.count);
    if (row._id.status === 'approved') {
      approved.set(key, (approved.get(key) ?? 0) + row.count);
    }
  }

  const now = new Date();
  const trend = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = monthKey(cursor);
    trend.push({
      month: key,
      label: MONTH_LABELS[cursor.getUTCMonth()],
      requests: requests.get(key) ?? 0,
      approved: approved.get(key) ?? 0,
    });
  }

  return trend;
}

/** GET /api/v1/doctor/dashboard */
export async function getDashboard(doctorId) {
  const doctor = toObjectId(doctorId);
  const now = new Date();
  const trendStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1), 1)
  );

  const [statusRows, consentRecords, recentRequests, recentActivity, recentAccess, trendRows, activeConsents] =
    await Promise.all([
      AccessRequest.aggregate([
        { $match: { doctorId: doctor } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // Every distinct record inside an active, unexpired consent held by THIS
      // doctor. Expired or revoked consents are excluded by the $match.
      Consent.aggregate([
        { $match: { doctorId: doctor, status: 'active', expiresAt: { $gt: now } } },
        { $unwind: '$authorizedRecords' },
        {
          $group: {
            _id: '$authorizedRecords',
            blockchainBacked: {
              $max: { $cond: [{ $ifNull: ['$transactionHash', false] }, 1, 0] },
            },
          },
        },
      ]),
      AccessRequest.find({ doctorId: doctor })
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT)
        .populate('patientId', PATIENT_POPULATE)
        .populate('requestedRecords', REQUEST_RECORD_POPULATE)
        .lean(),
      ActivityLog.find({ actorId: doctor }).sort({ timestamp: -1 }).limit(ACTIVITY_LIMIT).lean(),
      AccessLog.find({ doctorId: doctor })
        .sort({ accessedAt: -1, _id: -1 })
        .limit(RECENT_LIMIT)
        .populate('patientId', PATIENT_POPULATE)
        .populate('medicalRecordId', 'recordTitle category')
        .lean(),
      AccessRequest.aggregate([
        { $match: { doctorId: doctor, createdAt: { $gte: trendStart } } },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              status: '$status',
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Consent.countDocuments({ doctorId: doctor, status: 'active', expiresAt: { $gt: now } }),
    ]);

  const counts = new Map(statusRows.map((row) => [row._id, row.count]));
  const totalRequests = statusRows.reduce((sum, row) => sum + row.count, 0);

  // "Accessible" means deliverable today: an active, unexpired consent that is
  // anchored on-chain. Application-level consents without a blockchain anchor
  // are reported separately and are NOT counted as accessible.
  const blockchainBackedRecords = consentRecords.filter((row) => row.blockchainBacked === 1).length;
  const activeConsentRecords = consentRecords.length;

  return {
    stats: {
      totalRequests,
      pendingRequests: counts.get('pending') ?? 0,
      approvedRequests: counts.get('approved') ?? 0,
      rejectedRequests: counts.get('rejected') ?? 0,
      cancelledRequests: counts.get('cancelled') ?? 0,
      accessibleRecords: blockchainBackedRecords,
      activeConsents,
      activeConsentRecords,
      blockchainBackedRecords,
    },
    recentRequests: recentRequests.map(toSafeDoctorRequest),
    recentActivity: recentActivity.map((entry) => ({
      id: String(entry._id),
      action: entry.action,
      description: entry.description,
      timestamp: entry.timestamp,
    })),
    recentAccessHistory: recentAccess.map(toSafeDoctorAccessLog),
    requestTrend: buildRequestTrend(trendRows),
    generatedAt: now.toISOString(),
  };
}

// --- patient directory -------------------------------------------------------

/**
 * GET /api/v1/doctor/patients
 *
 * Identifying information only. The projection is an explicit allow-list, so a
 * new field added to the User model can never leak through this endpoint.
 */
export async function listPatients(query = {}) {
  const pagination = parsePagination(query);
  const filter = { role: 'patient' };

  const search = String(query.search ?? '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const [patients, total] = await Promise.all([
    User.find(filter)
      .select('fullName email dateOfBirth createdAt')
      .sort({ fullName: 1, _id: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    patients: patients.map(toSafePatientSummary),
    pagination: paginationMeta(pagination, total),
    filters: { search: search || null },
  };
}

// --- access requests ---------------------------------------------------------

function normalizeCategories(input) {
  const list = Array.isArray(input) ? input : input == null ? [] : [input];
  const cleaned = [];

  for (const raw of list) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    if (!RECORD_CATEGORIES.includes(value)) {
      throw httpError(400, 'Unsupported record category', 'INVALID_CATEGORY');
    }
    if (!cleaned.includes(value)) cleaned.push(value);
  }

  return cleaned;
}

/** Best-effort in-app notification. Never fails the doctor's submission. */
async function notifyPatient(patientId, payload) {
  try {
    await Notification.create({ recipientId: patientId, ...payload });
  } catch (error) {
    console.error('[MediConsent] Failed to create patient notification:', error.message);
  }
}

async function reloadDoctorRequest(requestId, doctorId) {
  const request = await AccessRequest.findOne({ _id: requestId, doctorId })
    .populate('patientId', PATIENT_POPULATE)
    .populate('requestedRecords', REQUEST_RECORD_POPULATE)
    .lean();
  return toSafeDoctorRequest(request);
}

/**
 * POST /api/v1/doctor/requests
 *
 * The doctor specifies a patient, the record CATEGORIES needed, a purpose and a
 * duration. No record ids are supplied by the doctor and none exist yet - the
 * patient selects the actual records when they review the request.
 *
 * No Consent is created here and nothing is written on-chain.
 */
export async function createAccessRequest(doctorId, payload = {}) {
  const patientId = String(payload.patientId ?? '').trim();
  if (!mongoose.isValidObjectId(patientId)) {
    throw httpError(400, 'Invalid patient id', 'INVALID_PATIENT_ID');
  }

  const purpose = String(payload.purpose ?? '').trim();
  if (purpose.length < 10 || purpose.length > 600) {
    throw httpError(
      400,
      'Purpose must be between 10 and 600 characters',
      'INVALID_PURPOSE'
    );
  }

  const requestedDuration = Number(payload.requestedDuration);
  if (!Number.isFinite(requestedDuration) || requestedDuration < 1 || requestedDuration > 365) {
    throw httpError(400, 'Requested duration must be between 1 and 365 days', 'INVALID_DURATION');
  }

  const categories = normalizeCategories(payload.categories ?? payload.requestedCategories);
  if (categories.length === 0) {
    throw httpError(400, 'Select at least one record category', 'CATEGORIES_REQUIRED');
  }

  const [patient, doctor] = await Promise.all([
    User.findOne({ _id: patientId, role: 'patient' }).select('fullName email role').lean(),
    User.findById(doctorId).select('fullName specialization hospitalName').lean(),
  ]);

  if (!patient) throw notFound('Patient not found', 'PATIENT_NOT_FOUND');

  // One outstanding request per doctor/patient pair keeps the inbox clean.
  const duplicate = await AccessRequest.findOne({
    doctorId,
    patientId,
    status: 'pending',
  }).select('_id');
  if (duplicate) {
    throw httpError(
      409,
      'You already have a pending request for this patient.',
      'DUPLICATE_PENDING_REQUEST'
    );
  }

  const request = await AccessRequest.create({
    patientId,
    doctorId,
    requestedCategories: categories,
    requestedRecords: [],
    purpose,
    requestedDuration,
    status: 'pending',
  });

  await recordActivity({
    actorId: doctorId,
    actorRole: 'doctor',
    action: 'access_request.submitted',
    description: `Doctor requested ${categories.length} record category(ies) from a patient`,
    targetType: 'AccessRequest',
    targetId: request._id,
    // Categories and duration only - no patient clinical data, no file paths.
    metadata: { categories, requestedDuration },
  });

  const doctorName = doctor?.fullName ?? 'A doctor';
  await notifyPatient(patientId, {
    title: 'New record access request',
    message: `${doctorName} requested access to ${categories.join(', ')}. Review and choose which records to share.`,
    notificationType: 'consent_request',
    relatedEntityType: 'AccessRequest',
    relatedEntityId: request._id,
  });

  return reloadDoctorRequest(request._id, doctorId);
}

/** GET /api/v1/doctor/requests */
export async function listDoctorRequests(doctorId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { doctorId };

  if (query.status) {
    if (!ACCESS_REQUEST_STATUSES.includes(query.status)) {
      throw httpError(400, 'Unsupported request status filter', 'INVALID_REQUEST_STATUS');
    }
    filter.status = query.status;
  }

  const search = String(query.search ?? '').trim();
  let patientSearchEmpty = false;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const matches = await User.find({ role: 'patient', fullName: rx })
      .select('_id')
      .limit(SEARCH_PATIENT_LIMIT)
      .lean();
    if (matches.length === 0) {
      patientSearchEmpty = true;
    } else {
      filter.patientId = { $in: matches.map((match) => match._id) };
    }
  }

  const [requests, total, statusRows] = patientSearchEmpty
    ? [[], 0, await AccessRequest.aggregate([{ $match: { doctorId } }, { $group: { _id: '$status', count: { $sum: 1 } } }])]
    : await Promise.all([
        AccessRequest.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .populate('patientId', PATIENT_POPULATE)
          .populate('requestedRecords', REQUEST_RECORD_POPULATE)
          .lean(),
        AccessRequest.countDocuments(filter),
        AccessRequest.aggregate([
          { $match: { doctorId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
      ]);

  const counts = new Map(statusRows.map((row) => [row._id, row.count]));

  return {
    requests: requests.map(toSafeDoctorRequest),
    counts: {
      total: statusRows.reduce((sum, row) => sum + row.count, 0),
      pending: counts.get('pending') ?? 0,
      approved: counts.get('approved') ?? 0,
      rejected: counts.get('rejected') ?? 0,
      cancelled: counts.get('cancelled') ?? 0,
    },
    pagination: paginationMeta(pagination, patientSearchEmpty ? 0 : total),
    filters: { status: query.status ?? null, search: search || null },
  };
}

// --- accessible records (security critical) ---------------------------------

/**
 * GET /api/v1/doctor/accessible-records
 *
 * A record is returned ONLY when there is a genuine, active, unexpired consent
 * held by this doctor AND that consent is anchored on-chain. An approved
 * access request is never sufficient - neither is a frontend flag.
 *
 * Because blockchain-backed consent is Phase 9, this legitimately returns an
 * empty list until then, with an explanation.
 */
export async function listAccessibleRecords(doctorId, query = {}) {
  const pagination = parsePagination(query);
  const now = new Date();

  const consents = await Consent.find({
    doctorId,
    status: 'active',
    expiresAt: { $gt: now },
    transactionHash: { $ne: null },
  })
    .sort({ expiresAt: 1 })
    .limit(CONSENT_SCAN_LIMIT)
    .populate('patientId', PATIENT_POPULATE)
    .populate('authorizedRecords', ACCESSIBLE_RECORD_POPULATE)
    .lean();

  const records = [];
  for (const consent of consents) {
    const consentPatientId = consent.patientId?._id ?? consent.patientId;
    for (const record of consent.authorizedRecords ?? []) {
      if (!record || typeof record !== 'object') continue;
      // Membership check: the record must genuinely belong to the consent's patient.
      if (String(record.patientId) !== String(consentPatientId)) continue;

      records.push({
        id: String(record._id),
        recordTitle: record.recordTitle,
        category: record.category ?? null,
        hospitalName: record.hospitalName ?? null,
        doctorName: record.doctorName ?? null,
        reportDate: record.reportDate ?? null,
        recordStatus: record.recordStatus ?? 'active',
        patient: toSafePatientSummary(consent.patientId),
        consentId: String(consent._id),
        consentGrantedAt: consent.grantedAt ?? null,
        consentExpiresAt: consent.expiresAt ?? null,
        purpose: consent.purpose,
        // Only ever a genuine stored anchor.
        blockchainBacked: true,
        transactionReference: consent.transactionHash ?? null,
      });
    }
  }

  const total = records.length;
  const page = records.slice(pagination.skip, pagination.skip + pagination.limit);

  return {
    records: page,
    pagination: paginationMeta(pagination, total),
    // Honest capability signal for the UI.
    secureAccessAvailable: total > 0,
    explanation:
      total > 0
        ? 'These records are covered by an active, blockchain-anchored consent.'
        : 'No blockchain-backed consent currently authorises file access. Secure record access becomes available after Phases 8 and 9.',
    blockchainPhaseReady: false,
  };
}

// --- access history ----------------------------------------------------------

/** GET /api/v1/doctor/access-history */
export async function listAccessHistory(doctorId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { doctorId };

  const result = String(query.result ?? query.accessResult ?? '').trim().toLowerCase();
  if (result) {
    if (!['granted', 'denied'].includes(result)) {
      throw httpError(400, 'Unsupported access result filter', 'INVALID_ACCESS_RESULT');
    }
    filter.accessResult = result;
  }

  const from = parseDateBoundary(query.from);
  const to = parseDateBoundary(query.to, true);
  if (from || to) {
    filter.accessedAt = {};
    if (from) filter.accessedAt.$gte = from;
    if (to) filter.accessedAt.$lte = to;
  }

  const [entries, total, granted, denied] = await Promise.all([
    AccessLog.find(filter)
      .sort({ accessedAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('patientId', PATIENT_POPULATE)
      .populate('medicalRecordId', 'recordTitle category')
      .lean(),
    AccessLog.countDocuments(filter),
    AccessLog.countDocuments({ doctorId, accessResult: 'granted' }),
    AccessLog.countDocuments({ doctorId, accessResult: 'denied' }),
  ]);

  return {
    entries: entries.map(toSafeDoctorAccessLog),
    counts: { total, granted, denied },
    pagination: paginationMeta(pagination, total),
    filters: { result: result || null, from: query.from ?? null, to: query.to ?? null },
  };
}

// --- profile -----------------------------------------------------------------

/** GET /api/v1/doctor/profile */
export async function getProfile(doctorId) {
  const user = await User.findOne({ _id: doctorId, role: 'doctor' });
  if (!user) throw notFound('Doctor profile not found', 'PROFILE_NOT_FOUND');
  return toSafeUser(user);
}

/**
 * PATCH /api/v1/doctor/profile
 *
 * Only the editable allow-list can change. Email, medical registration number,
 * verification/account status and wallet address are rejected explicitly rather
 * than silently ignored, so a client can never believe a protected change
 * succeeded. No file paths and no certificate uploads in this phase.
 */
export async function updateProfile(doctorId, payload = {}) {
  const provided = Object.keys(payload ?? {});
  const protectedAttempt = provided.filter((field) => PROTECTED_DOCTOR_FIELDS.includes(field));
  if (protectedAttempt.length > 0) {
    const field = protectedAttempt[0];
    throw httpError(400, `"${field}" cannot be changed through this endpoint`, 'PROTECTED_FIELD');
  }

  const updates = {};
  for (const field of EDITABLE_DOCTOR_FIELDS) {
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
  // Specialization and hospital are mandatory for a doctor account, so they can
  // be changed but never cleared.
  if (updates.specialization !== undefined && !String(updates.specialization ?? '').trim()) {
    throw httpError(400, 'Specialization is required', 'SPECIALIZATION_REQUIRED');
  }
  if (updates.hospitalName !== undefined && !String(updates.hospitalName ?? '').trim()) {
    throw httpError(400, 'Hospital or clinic name is required', 'HOSPITAL_REQUIRED');
  }

  const user = await User.findByIdAndUpdate(
    doctorId,
    { $set: updates },
    { new: true, runValidators: true, context: 'query' }
  );
  if (!user) throw notFound('Doctor profile not found', 'PROFILE_NOT_FOUND');

  await recordActivity({
    actorId: doctorId,
    actorRole: 'doctor',
    action: 'doctor.profile_updated',
    description: `Doctor updated profile fields: ${Object.keys(updates).join(', ')}`,
    targetType: 'User',
    targetId: user._id,
    // Field names only - no values, no credentials, no documents.
    metadata: { fields: Object.keys(updates) },
  });

  return toSafeUser(user);
}

// --- notifications -----------------------------------------------------------

/** GET /api/v1/doctor/notifications */
export async function listNotifications(doctorId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { recipientId: doctorId };

  const unreadOnly = String(query.unread ?? '').toLowerCase();
  if (unreadOnly === 'true' || unreadOnly === '1') filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientId: doctorId, isRead: false }),
  ]);

  return {
    notifications: notifications.map(toSafeNotification),
    unreadCount,
    pagination: paginationMeta(pagination, total),
  };
}

/** PATCH /api/v1/doctor/notifications/:id/read */
export async function markNotificationRead(doctorId, notificationId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw httpError(400, 'Invalid notification id', 'INVALID_NOTIFICATION_ID');
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: doctorId },
    { $set: { isRead: true } },
    { new: true }
  ).lean();

  if (!notification) throw notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');

  const unreadCount = await Notification.countDocuments({ recipientId: doctorId, isRead: false });
  return { notification: toSafeNotification(notification), unreadCount };
}

/** PATCH /api/v1/doctor/notifications/read-all */
export async function markAllNotificationsRead(doctorId) {
  const result = await Notification.updateMany(
    { recipientId: doctorId, isRead: false },
    { $set: { isRead: true } }
  );
  return { updated: result.modifiedCount ?? 0, unreadCount: 0 };
}

// --- Doctor Verification Certificate & File Security (Phase 8) ---------------

/**
 * POST /api/v1/doctor/certificate
 *
 * Validates, encrypts with AES-256-GCM and stores a doctor's verification certificate.
 * Only the ciphertext is written to private storage; metadata is kept on the User document.
 */
export async function uploadDoctorCertificate(doctorId, file) {
  const upload = validateUploadedFile(file);
  const doctor = await User.findById(doctorId);
  if (!doctor || doctor.role !== 'doctor') {
    throw httpError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  const oldFileReference = doctor.certificateFileReference;
  const stored = await storeEncryptedFile({ buffer: file.buffer, scope: 'certificates' });

  try {
    doctor.certificateFileReference = stored.fileReference;
    doctor.certificateMetadata = {
      originalFileName: upload.originalFileName,
      mimeType: upload.mimeType,
      fileSize: stored.fileSize,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
      encryptionAlgorithm: stored.encryptionAlgorithm,
      encryptionVersion: stored.encryptionVersion,
      uploadedAt: new Date(),
    };
    await doctor.save();
  } catch (error) {
    await removeEncryptedFile(stored.fileReference);
    throw error;
  }

  if (oldFileReference && oldFileReference !== stored.fileReference) {
    await removeEncryptedFile(oldFileReference);
  }

  await recordActivity({
    actorId: doctorId,
    actorRole: 'doctor',
    action: 'doctor_certificate.uploaded',
    description: 'Doctor uploaded verification certificate.',
    targetType: 'User',
    targetId: doctor._id,
    metadata: { fileSize: stored.fileSize, mimeType: upload.mimeType },
  });

  return toSafeCertificate(doctor);
}

/**
 * GET /api/v1/doctor/certificate
 *
 * Returns safe metadata about the doctor's verification certificate.
 */
export async function getDoctorCertificate(doctorId) {
  const doctor = await User.findById(doctorId);
  if (!doctor || doctor.role !== 'doctor') {
    throw httpError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }
  return toSafeCertificate(doctor);
}

/**
 * GET /api/v1/doctor/records/:id/download
 *
 * Secure medical document delivery for verified doctors with active on-chain consent (Phase 9).
 * Enforces live blockchain verification against the MediConsent smart contract before decryption.
 */
export async function downloadRecordForDoctor(doctorId, recordId) {
  if (!mongoose.isValidObjectId(recordId)) {
    throw httpError(400, 'Invalid medical record id', 'INVALID_RECORD_ID');
  }

  // 1 & 2. Verify doctor authentication, account status, and admin verification
  const doctor = await User.findById(doctorId);
  if (!doctor || doctor.role !== 'doctor') {
    throw httpError(403, 'Doctor account not found', 'DOCTOR_NOT_FOUND');
  }
  if (doctor.accountStatus !== 'active' || doctor.verificationStatus !== 'verified') {
    throw httpError(403, 'Doctor is not active and verified by an administrator', 'DOCTOR_NOT_VERIFIED');
  }

  // 3. Verify doctor has a verified wallet association
  if (!doctor.walletAddress) {
    throw httpError(403, 'Doctor has not linked a verified Ethereum wallet', 'DOCTOR_WALLET_REQUIRED');
  }

  // 4. Medical record exists
  const record = await MedicalRecord.findOne({
    _id: recordId,
    recordStatus: { $ne: 'deleted' },
  });
  if (!record) {
    throw httpError(404, 'Medical record not found', 'RECORD_NOT_FOUND');
  }

  // 5. Patient account exists and is not suspended
  const patient = await User.findById(record.patientId);
  if (!patient || patient.accountStatus === 'suspended') {
    throw httpError(404, 'Patient account not found or suspended', 'PATIENT_NOT_FOUND');
  }

  // 6 & 7. Doctor has corresponding consent in MongoDB authorizing this exact record
  const now = new Date();
  const consent = await Consent.findOne({
    doctorId: doctor._id,
    patientId: record.patientId,
    authorizedRecords: record._id,
    status: 'active',
    expiresAt: { $gt: now },
    blockchainConsentId: { $ne: null },
    transactionHash: { $ne: null },
  });

  if (!consent) {
    await AccessLog.create({
      patientId: record.patientId,
      doctorId: doctor._id,
      medicalRecordId: record._id,
      accessedAt: now,
      accessResult: 'denied',
      reason: 'No active MongoDB consent authorizing this record',
    }).catch(() => {});

    throw httpError(
      403,
      'No active on-chain consent authorizes you to access this medical record.',
      'CONSENT_REQUIRED'
    );
  }

  // 8. Patient wallet configured
  if (!patient.walletAddress) {
    throw httpError(403, 'Patient wallet is not configured', 'PATIENT_WALLET_REQUIRED');
  }

  // 9. Chain ID match
  if (consent.chainId && Number(consent.chainId) !== Number(env.chainId)) {
    throw httpError(403, 'Consent chain ID mismatch', 'CHAIN_ID_MISMATCH');
  }

  // 10, 11 & 12. Query the live smart contract: confirms consent exists, not revoked, not expired, and authorizes record
  const isAuthorizedOnChain = await checkLiveOnChainConsent(
    consent.blockchainConsentId,
    doctor.walletAddress,
    record._id
  );

  if (!isAuthorizedOnChain) {
    await AccessLog.create({
      patientId: record.patientId,
      doctorId: doctor._id,
      medicalRecordId: record._id,
      accessedAt: now,
      accessResult: 'denied',
      reason: 'Live on-chain blockchain verification denied access (revoked, expired, or unauthorized record hash)',
    }).catch(() => {});

    throw httpError(
      403,
      'Live smart-contract verification failed. Consent may be expired, revoked, or does not include this record on-chain.',
      'BLOCKCHAIN_CONSENT_DENIED'
    );
  }

  // Decrypt in memory and verify SHA-256 integrity hash
  const buffer = await readVerifiedFile(record);

  // Record successful AccessLog entry
  await AccessLog.create({
    patientId: record.patientId,
    doctorId: doctor._id,
    medicalRecordId: record._id,
    accessedAt: new Date(),
    accessResult: 'granted',
    reason: `On-chain consent ${consent.blockchainConsentId} verified successfully`,
  }).catch(() => {});

  await recordActivity({
    actorId: doctorId,
    actorRole: 'doctor',
    action: 'medical_record.downloaded',
    description: `Downloaded record "${record.recordTitle}" under on-chain consent ${consent.blockchainConsentId}`,
    targetType: 'MedicalRecord',
    targetId: record._id,
    metadata: {
      patientId: record.patientId,
      consentId: consent.blockchainConsentId,
      transactionHash: consent.transactionHash,
    },
  });

  return {
    buffer,
    record,
    filename: record.originalFileName || `${record.recordTitle}.bin`,
    mimeType: record.mimeType || 'application/octet-stream',
  };
}

export { RECORD_CATEGORIES };

export default {
  PROTECTED_DOCTOR_FIELDS,
  EDITABLE_DOCTOR_FIELDS,
  toSafePatientSummary,
  toSafeDoctorRequest,
  getDashboard,
  listPatients,
  createAccessRequest,
  listDoctorRequests,
  listAccessibleRecords,
  listAccessHistory,
  getProfile,
  updateProfile,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  uploadDoctorCertificate,
  getDoctorCertificate,
  downloadRecordForDoctor,
};
