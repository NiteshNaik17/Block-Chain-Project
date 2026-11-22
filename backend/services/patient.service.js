import mongoose from 'mongoose';

import AccessLog from '../models/AccessLog.js';
import AccessRequest from '../models/AccessRequest.js';
import ActivityLog from '../models/ActivityLog.js';
import Consent from '../models/Consent.js';
import MedicalRecord, { RECORD_CATEGORIES, RECORD_STATUSES } from '../models/MedicalRecord.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { recordActivity } from './activity.service.js';
import { httpError, toSafeUser } from './auth.service.js';
import { readVerifiedFile, removeEncryptedFile, storeEncryptedFile } from './secureFile.service.js';
import { validateUploadedFile } from '../utils/fileValidation.js';
import { isStorageReference } from '../utils/privateStorage.js';

/**
 * Patient portal service (Phase 5).
 *
 * Every function in this module takes the authenticated patient's database id as
 * its first argument and scopes EVERY query to it. A patient id coming from the
 * request body / query string is never used to decide ownership.
 *
 * Phase 8 adds the upload/download pipeline. Both functions below still scope
 * every query to the authenticated patient; the stored file itself is opened
 * through `secureFile.service`, and no response ever contains a storage
 * reference, an encryption key, an IV or an authentication tag.
 */

/** Consents inside this window are reported as "expiring soon". */
export const EXPIRING_WINDOW_DAYS = 30;

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const RECENT_LIMIT = 5;
const ACTIVITY_LIMIT = 6;
const ACTIVITY_TREND_MONTHS = 6;
const HISTORY_SCAN_LIMIT = 500;

/** Fields a patient may never change through the profile endpoint. */
export const PROTECTED_PROFILE_FIELDS = [
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
  'verificationReason',
  'createdAt',
  'updatedAt',
];

/** Fields a patient may update through the profile endpoint. */
export const EDITABLE_PROFILE_FIELDS = [
  'fullName',
  'mobileNumber',
  'dateOfBirth',
  'gender',
  'address',
  'emergencyContact',
  'bloodGroup',
  'profilePhoto',
];

// --- small helpers -----------------------------------------------------------

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

export function parsePagination(query = {}) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, limit, skip: (page - 1) * limit };
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

// --- serialisers (allow-list only; never a raw document) ---------------------

/**
 * Safe, patient-facing view of a medical record.
 * Deliberately omits `fileReference`, the AES-GCM IV/authentication tag and any
 * storage path: the frontend never receives a way to reach the stored document.
 * `fileName` is display metadata only - the original name of the file the
 * patient chose, never used to build a storage path.
 */
export function toSafeRecord(record) {
  if (!record) return null;
  return {
    id: String(record._id),
    recordTitle: record.recordTitle,
    category: record.category,
    hospitalName: record.hospitalName,
    doctorName: record.doctorName ?? null,
    reportDate: record.reportDate,
    description: record.description ?? null,
    fileName: record.originalFileName ?? null,
    mimeType: record.mimeType ?? null,
    fileSize: typeof record.fileSize === 'number' ? record.fileSize : null,
    uploadedAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
    encryptionStatus: record.encryptionStatus ?? 'pending',
    // An integrity digest only exists once a file has actually been processed.
    integrityStatus: record.integrityHash ? 'recorded' : 'pending',
    recordStatus: record.recordStatus ?? 'active',
  };
}

/** Minimal professional profile of a doctor, safe to show a patient. */
export function toSafeDoctor(doctor) {
  if (!doctor) return null;
  return {
    id: String(doctor._id),
    fullName: doctor.fullName ?? 'Unknown doctor',
    specialization: doctor.specialization ?? null,
    hospitalName: doctor.hospitalName ?? null,
    medicalRegistrationNumber: doctor.medicalRegistrationNumber ?? null,
    walletAddress: doctor.walletAddress ?? null,
  };
}

function toSafeRecordSummary(record, patientId) {
  if (!record || String(record.patientId) !== String(patientId)) return null;
  return {
    id: String(record._id),
    recordTitle: record.recordTitle,
    category: record.category ?? null,
    reportDate: record.reportDate ?? null,
    recordStatus: record.recordStatus ?? 'active',
  };
}

/** Patient-facing view of a doctor's access request. */
export function toSafeRequest(request, patientId) {
  if (!request) return null;
  const records = (request.requestedRecords ?? [])
    .map((record) => toSafeRecordSummary(record, patientId))
    .filter(Boolean);
  const requestedCategories = Array.isArray(request.requestedCategories)
    ? request.requestedCategories
    : [];

  return {
    id: String(request._id),
    doctor: toSafeDoctor(request.doctorId),
    // Phase 6 category-first: the doctor states the categories they need; the
    // patient then chooses which of their OWN records to share.
    requestedCategories,
    // Only ever the patient's own records - a category-first request starts
    // empty until the patient makes a selection.
    requestedRecords: records,
    recordCount: records.length,
    requiresRecordSelection: records.length === 0 && request.status === 'pending',
    purpose: request.purpose,
    requestedDuration: request.requestedDuration,
    status: request.status,
    requestedAt: request.createdAt ?? null,
    patientResponseDate: request.patientResponseDate ?? null,
    rejectionReason: request.rejectionReason ?? null,
    // An approved request is only the patient's recorded decision.
    grantedOnChain: false,
  };
}

/** Effective consent status - an active consent past its expiry is expired. */
export function effectiveConsentStatus(consent, now = new Date()) {
  if (!consent) return null;
  if (consent.status === 'active' && consent.expiresAt && new Date(consent.expiresAt) <= now) {
    return 'expired';
  }
  return consent.status;
}

export function toSafeConsent(consent, patientId, now = new Date()) {
  if (!consent) return null;
  const records = (consent.authorizedRecords ?? [])
    .map((record) => toSafeRecordSummary(record, patientId))
    .filter(Boolean);

  return {
    id: String(consent._id),
    doctor: toSafeDoctor(consent.doctorId),
    authorizedRecords: records,
    recordCount: records.length,
    purpose: consent.purpose,
    grantedAt: consent.grantedAt ?? null,
    expiresAt: consent.expiresAt ?? null,
    status: effectiveConsentStatus(consent, now),
    storedStatus: consent.status,
    // Only ever a real, stored anchor. Null until Phase 9 anchors the consent.
    transactionReference: consent.transactionHash ?? null,
    transactionHash: consent.transactionHash ?? null,
    blockchainConsentId: consent.blockchainConsentId ?? null,
    blockchainBacked: Boolean(consent.transactionHash),
    chainId: consent.chainId ?? null,
    contractAddress: consent.contractAddress ?? null,
    blockNumber: consent.blockNumber ?? null,
    revokedAt: consent.revokedAt ?? null,
    accessRequestId: consent.accessRequestId ? String(consent.accessRequestId) : null,
  };
}

export function toSafeNotification(notification) {
  if (!notification) return null;
  return {
    id: String(notification._id),
    title: notification.title,
    message: notification.message,
    notificationType: notification.notificationType ?? 'system',
    isRead: Boolean(notification.isRead),
    relatedEntityType: notification.relatedEntityType ?? null,
    relatedEntityId: notification.relatedEntityId ? String(notification.relatedEntityId) : null,
    createdAt: notification.createdAt ?? null,
  };
}

function toSafeAccessLog(entry) {
  if (!entry) return null;
  const record = entry.medicalRecordId;
  return {
    id: String(entry._id),
    doctor: toSafeDoctor(entry.doctorId),
    record: record && typeof record === 'object'
      ? { id: String(record._id), recordTitle: record.recordTitle, category: record.category ?? null }
      : null,
    accessedAt: entry.accessedAt ?? null,
    accessResult: entry.accessResult,
    reason: entry.reason ?? null,
  };
}

// --- dashboard ---------------------------------------------------------------

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildActivityTrend(rows, months = ACTIVITY_TREND_MONTHS) {
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  const now = new Date();
  const trend = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = monthKey(cursor);
    trend.push({ month: key, label: MONTH_LABELS[cursor.getUTCMonth()], count: counts.get(key) ?? 0 });
  }

  return trend;
}

/** GET /api/v1/patient/dashboard */
export async function getDashboard(patientId) {
  const patient = toObjectId(patientId);
  const now = new Date();
  const expiringBefore = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (ACTIVITY_TREND_MONTHS - 1), 1));

  const [recordFacet, accessFacet, pendingRequests, activeConsents, expiringConsents, recentRecords, recentRequests, recentActivity, trendRows] =
    await Promise.all([
      MedicalRecord.aggregate([
        { $match: { patientId: patient, recordStatus: 'active' } },
        {
          $facet: {
            totals: [{ $count: 'count' }],
            byCategory: [
              { $group: { _id: '$category', count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
            ],
            byEncryption: [{ $group: { _id: '$encryptionStatus', count: { $sum: 1 } } }],
            byIntegrity: [
              {
                $group: {
                  _id: { $cond: [{ $ifNull: ['$integrityHash', false] }, 'recorded', 'pending'] },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),
      AccessLog.aggregate([
        { $match: { patientId: patient } },
        { $group: { _id: '$accessResult', count: { $sum: 1 } } },
      ]),
      AccessRequest.countDocuments({ patientId: patient, status: 'pending' }),
      Consent.countDocuments({ patientId: patient, status: 'active', expiresAt: { $gt: now } }),
      Consent.countDocuments({ patientId: patient, status: 'active', expiresAt: { $gt: now, $lte: expiringBefore } }),
      MedicalRecord.find({ patientId: patient, recordStatus: 'active' })
        .sort({ reportDate: -1, createdAt: -1 })
        .limit(RECENT_LIMIT)
        .lean(),
      AccessRequest.find({ patientId: patient })
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT)
        .populate('doctorId', 'fullName specialization hospitalName medicalRegistrationNumber')
        .populate('requestedRecords', 'recordTitle category reportDate patientId recordStatus')
        .lean(),
      ActivityLog.find({ actorId: patient }).sort({ timestamp: -1 }).limit(ACTIVITY_LIMIT).lean(),
      ActivityLog.aggregate([
        { $match: { actorId: patient, timestamp: { $gte: trendStart } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$timestamp' } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

  const facet = recordFacet[0] ?? {};
  const totalRecords = facet.totals?.[0]?.count ?? 0;
  const accessCounts = new Map(accessFacet.map((row) => [row._id, row.count]));

  return {
    stats: {
      totalRecords,
      pendingRequests,
      activeConsents,
      expiringConsents,
      expiringWindowDays: EXPIRING_WINDOW_DAYS,
      grantedAccessEvents: accessCounts.get('granted') ?? 0,
      deniedAccessEvents: accessCounts.get('denied') ?? 0,
      recordsByCategory: (facet.byCategory ?? []).map((row) => ({ category: row._id, count: row.count })),
      recordsByEncryption: (facet.byEncryption ?? []).map((row) => ({ status: row._id ?? 'pending', count: row.count })),
      recordsByIntegrity: (facet.byIntegrity ?? []).map((row) => ({ status: row._id, count: row.count })),
    },
    recentRecords: recentRecords.map(toSafeRecord),
    recentRequests: recentRequests.map((request) => toSafeRequest(request, patientId)),
    recentActivity: recentActivity.map((entry) => ({
      id: String(entry._id),
      action: entry.action,
      description: entry.description,
      timestamp: entry.timestamp,
    })),
    activityTrend: buildActivityTrend(trendRows),
    generatedAt: now.toISOString(),
  };
}

// --- medical records ---------------------------------------------------------

function buildRecordFilter(patientId, query = {}) {
  const filter = { patientId };

  const recordStatus = query.recordStatus ?? query.status;
  if (recordStatus) {
    if (!RECORD_STATUSES.includes(recordStatus)) {
      throw httpError(400, 'Unsupported record status filter', 'INVALID_RECORD_STATUS');
    }
    filter.recordStatus = recordStatus;
  } else {
    // Soft-deleted records are never listed.
    filter.recordStatus = { $ne: 'deleted' };
  }

  if (query.category) {
    if (!RECORD_CATEGORIES.includes(query.category)) {
      throw httpError(400, 'Unsupported record category filter', 'INVALID_RECORD_CATEGORY');
    }
    filter.category = query.category;
  }

  const search = String(query.search ?? '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ recordTitle: rx }, { hospitalName: rx }];
  }

  const from = parseDateBoundary(query.from ?? query.dateFrom);
  const to = parseDateBoundary(query.to ?? query.dateTo, true);
  if (from || to) {
    filter.reportDate = {};
    if (from) filter.reportDate.$gte = from;
    if (to) filter.reportDate.$lte = to;
  }

  return filter;
}

function buildRecordSort(query = {}) {
  const allowed = { reportDate: 'reportDate', createdAt: 'createdAt', uploadedAt: 'createdAt' };
  const requested = String(query.sortBy ?? '');
  const field = allowed[requested] ?? 'reportDate';
  const direction = String(query.sortOrder ?? '').toLowerCase() === 'asc' ? 1 : -1;
  return { [field]: direction, _id: direction };
}

/** GET /api/v1/patient/records */
export async function listRecords(patientId, query = {}) {
  const pagination = parsePagination(query);
  const filter = buildRecordFilter(patientId, query);
  const sort = buildRecordSort(query);

  const [records, total] = await Promise.all([
    MedicalRecord.find(filter).sort(sort).skip(pagination.skip).limit(pagination.limit).lean(),
    MedicalRecord.countDocuments(filter),
  ]);

  return {
    records: records.map(toSafeRecord),
    pagination: paginationMeta(pagination, total),
    filters: {
      search: String(query.search ?? '').trim() || null,
      category: query.category ?? null,
      status: query.recordStatus ?? query.status ?? null,
      from: query.from ?? query.dateFrom ?? null,
      to: query.to ?? query.dateTo ?? null,
      sortBy: sort.reportDate !== undefined ? 'reportDate' : 'createdAt',
      sortOrder: Object.values(sort)[0] === 1 ? 'asc' : 'desc',
    },
  };
}

/** GET /api/v1/patient/records/:id */
export async function getRecordById(patientId, recordId) {
  if (!mongoose.isValidObjectId(recordId)) {
    throw httpError(400, 'Invalid medical record id', 'INVALID_RECORD_ID');
  }

  // Scoped to the authenticated patient: another patient's record is a 404.
  const record = await MedicalRecord.findOne({
    _id: recordId,
    patientId,
    recordStatus: { $ne: 'deleted' },
  }).lean();

  if (!record) throw notFound('Medical record not found', 'RECORD_NOT_FOUND');

  return toSafeRecord(record);
}

// --- secure document upload / download (Phase 8) ------------------------------

/** Server-side validation of the metadata that arrives with an upload. */
function assertUploadMetadata(fields = {}) {
  const recordTitle = String(fields.recordTitle ?? fields.title ?? '').trim();
  if (recordTitle.length < 3 || recordTitle.length > 160) {
    throw httpError(400, 'Record title must be between 3 and 160 characters', 'INVALID_RECORD_TITLE');
  }

  const category = String(fields.category ?? '').trim();
  if (!RECORD_CATEGORIES.includes(category)) {
    throw httpError(400, 'Record category is not supported', 'INVALID_RECORD_CATEGORY');
  }

  const hospitalName = String(fields.hospitalName ?? fields.hospital ?? '').trim();
  if (hospitalName.length < 2 || hospitalName.length > 200) {
    throw httpError(400, 'Hospital or clinic name is required', 'INVALID_HOSPITAL_NAME');
  }

  const doctorName = String(fields.doctorName ?? '').trim();
  if (doctorName.length > 120) {
    throw httpError(400, 'Doctor name is too long', 'INVALID_DOCTOR_NAME');
  }

  const description = String(fields.description ?? '').trim();
  if (description.length > 1000) {
    throw httpError(400, 'Description must be at most 1000 characters', 'INVALID_DESCRIPTION');
  }

  const reportDate = new Date(String(fields.reportDate ?? ''));
  if (Number.isNaN(reportDate.getTime())) {
    throw httpError(400, 'A valid report date is required', 'INVALID_REPORT_DATE');
  }

  return {
    recordTitle,
    category,
    hospitalName,
    doctorName: doctorName || null,
    description: description || null,
    reportDate,
  };
}

/**
 * POST /api/v1/patient/records
 *
 * The order matters: validate -> SHA-256 the plaintext -> encrypt with a fresh
 * IV -> write ONLY the ciphertext -> store safe metadata. If MongoDB rejects the
 * row the ciphertext written in step 3 is removed again, so no orphaned or
 * partially stored document is left behind.
 *
 * Ownership comes from the authenticated session (`patientId`), never from the
 * request body.
 */
export async function createMedicalRecord(patientId, { file, fields = {} } = {}) {
  // Rejects wrong extensions, forged signatures and oversized payloads.
  const upload = validateUploadedFile(file);
  const metadata = assertUploadMetadata(fields);

  const stored = await storeEncryptedFile({ buffer: file.buffer, scope: 'records' });

  let record;
  try {
    record = await MedicalRecord.create({
      patientId,
      ...metadata,
      fileReference: stored.fileReference,
      originalFileName: upload.originalFileName,
      mimeType: upload.mimeType,
      fileSize: stored.fileSize,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
      encryptionAlgorithm: stored.encryptionAlgorithm,
      encryptionVersion: stored.encryptionVersion,
      encryptedData: stored.encryptedData,
      encryptionStatus: 'encrypted',
      recordStatus: 'active',
    });
  } catch (error) {
    // Database persistence failed - clean up the encrypted file we just wrote.
    await removeEncryptedFile(stored.fileReference);
    throw error;
  }

  await recordActivity({
    actorId: patientId,
    actorRole: 'patient',
    action: 'medical_record.uploaded',
    description: 'Encrypted medical document uploaded to the private vault.',
    targetType: 'MedicalRecord',
    targetId: record._id,
    // Never the file name, the storage reference or any crypto material.
    metadata: { category: record.category, encryptionStatus: record.encryptionStatus },
  });

  return toSafeRecord(record);
}

/**
 * GET /api/v1/patient/records/:id/download
 *
 * Authorises against the authenticated patient, reads the ciphertext, decrypts
 * it in memory and verifies its SHA-256 digest before a single byte is sent.
 * The buffer returned here stays in memory - it is never written back to disk.
 */
export async function getRecordDocument(patientId, recordId) {
  if (!mongoose.isValidObjectId(recordId)) {
    throw httpError(400, 'Invalid medical record id', 'INVALID_RECORD_ID');
  }

  // Scoped to the authenticated patient: another patient's record is a 404, so
  // record ids cannot be probed.
  const record = await MedicalRecord.findOne({
    _id: recordId,
    patientId,
    recordStatus: { $ne: 'deleted' },
  });

  if (!record) throw notFound('Medical record not found', 'RECORD_NOT_FOUND');

  // A metadata-only (legacy) row, or a reference this server did not generate,
  // is simply "not available" - the same answer as a missing file.
  if (!record.integrityHash || !isStorageReference(record.fileReference)) {
    throw notFound('This medical document is not available', 'FILE_NOT_AVAILABLE');
  }

  // Decrypt + integrity check. Nothing is returned unless both succeed.
  const buffer = await readVerifiedFile(record);

  await recordActivity({
    actorId: patientId,
    actorRole: 'patient',
    action: 'medical_record.downloaded',
    description: 'Patient downloaded their own encrypted medical document.',
    targetType: 'MedicalRecord',
    targetId: record._id,
    metadata: { result: 'granted', integrity: 'verified' },
  });

  return {
    buffer,
    // Display name for the Content-Disposition header - a name only, never a path.
    fileName: record.originalFileName || `record-${record._id}.dat`,
    mimeType: record.mimeType || 'application/octet-stream',
  };
}

// --- doctor access requests --------------------------------------------------

const DOCTOR_POPULATE = 'fullName specialization hospitalName medicalRegistrationNumber';
const REQUEST_RECORD_POPULATE = 'recordTitle category reportDate patientId recordStatus';

/** GET /api/v1/patient/requests */
export async function listAccessRequests(patientId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { patientId };

  if (query.status) {
    const allowed = ['pending', 'approved', 'rejected', 'cancelled'];
    if (!allowed.includes(query.status)) {
      throw httpError(400, 'Unsupported request status filter', 'INVALID_REQUEST_STATUS');
    }
    filter.status = query.status;
  }

  const [requests, total, pendingTotal] = await Promise.all([
    AccessRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('doctorId', DOCTOR_POPULATE)
      .populate('requestedRecords', REQUEST_RECORD_POPULATE)
      .lean(),
    AccessRequest.countDocuments(filter),
    AccessRequest.countDocuments({ patientId, status: 'pending' }),
  ]);

  return {
    requests: requests.map((request) => toSafeRequest(request, patientId)),
    pendingCount: pendingTotal,
    pagination: paginationMeta(pagination, total),
  };
}

async function findOwnedRequest(patientId, requestId) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw httpError(400, 'Invalid access request id', 'INVALID_REQUEST_ID');
  }

  const request = await AccessRequest.findOne({ _id: requestId, patientId });
  if (!request) throw notFound('Access request not found', 'REQUEST_NOT_FOUND');

  if (request.status !== 'pending') {
    throw httpError(
      409,
      `This request has already been ${request.status}.`,
      'REQUEST_ALREADY_PROCESSED'
    );
  }

  return request;
}

/** Every record id must still belong to the authenticated patient. */
async function assertRecordsOwned(patientId, recordIds) {
  const ids = (recordIds ?? []).map((recordId) => String(recordId));
  if (ids.length === 0) {
    throw httpError(400, 'This request does not reference any records', 'REQUEST_RECORD_MISMATCH');
  }

  const ownedCount = await MedicalRecord.countDocuments({
    _id: { $in: ids },
    patientId,
  });

  if (ownedCount !== ids.length) {
    throw httpError(
      400,
      'This request references records that do not belong to your account',
      'REQUEST_RECORD_MISMATCH'
    );
  }

  return ids;
}

/**
 * Resolve which of the patient's records a decision covers.
 *
 *  - A Phase 5 record-first request already names the records: those are
 *    validated against the patient's ownership (unchanged behaviour).
 *  - A Phase 6 category-first request names no records yet: the patient must
 *    supply the ids of the records they are willing to share, and every one of
 *    them is validated as belonging to the authenticated patient.
 */
async function resolveDecisionRecords(patientId, request, selectedRecordIds) {
  const existing = (request.requestedRecords ?? []).map((recordId) => String(recordId));
  if (existing.length > 0) return assertRecordsOwned(patientId, existing);

  const selected = Array.isArray(selectedRecordIds)
    ? selectedRecordIds.map((recordId) => String(recordId))
    : [];
  if (selected.length === 0) {
    throw httpError(
      400,
      'Select at least one of your records to share before approving',
      'RECORDS_REQUIRED_FOR_APPROVAL'
    );
  }

  return assertRecordsOwned(patientId, selected);
}

/** Best-effort in-app notification. Never fails the patient's decision. */
async function notifyDoctor(doctorId, payload) {
  try {
    await Notification.create({ recipientId: doctorId, ...payload });
  } catch (error) {
    console.error('[MediConsent] Failed to create doctor notification:', error.message);
  }
}

async function reloadRequest(requestId, patientId) {
  const request = await AccessRequest.findById(requestId)
    .populate('doctorId', DOCTOR_POPULATE)
    .populate('requestedRecords', REQUEST_RECORD_POPULATE)
    .lean();
  return toSafeRequest(request, patientId);
}

/**
 * PATCH /api/v1/patient/requests/:id/approve
 *
 * Approving records the patient's DECISION only. It deliberately does NOT:
 *  - create a Consent document,
 *  - grant a doctor access to any file,
 *  - write a blockchain transaction or invent a transaction hash.
 * Enforceable, blockchain-backed consent is Phase 9.
 *
 * For a Phase 6 category-first request the patient supplies `selectedRecordIds`
 * (their OWN records); every id is validated for ownership before being stored.
 */
export async function approveAccessRequest(patientId, requestId, selectedRecordIds = null) {
  const request = await findOwnedRequest(patientId, requestId);
  const recordIds = await resolveDecisionRecords(patientId, request, selectedRecordIds);

  // Store the actual patient-selected records. A category-first request starts
  // with none, so this is where the patient's choice is persisted.
  request.requestedRecords = recordIds;
  request.status = 'approved';
  request.patientResponseDate = new Date();
  request.rejectionReason = null;
  await request.save();

  await recordActivity({
    actorId: patientId,
    actorRole: 'patient',
    action: 'access_request.approved',
    description: `Access request from doctor ${request.doctorId} approved for ${recordIds.length} record(s)`,
    targetType: 'AccessRequest',
    targetId: request._id,
    metadata: { status: 'approved', recordCount: recordIds.length },
  });

  await notifyDoctor(request.doctorId, {
    title: 'Access request approved',
    message: 'A patient approved your access request. Blockchain-backed consent arrives in Phase 9.',
    notificationType: 'consent_approved',
    relatedEntityType: 'AccessRequest',
    relatedEntityId: request._id,
  });

  return reloadRequest(request._id, patientId);
}

/**
 * PATCH /api/v1/patient/requests/:id/reject
 *
 * Records the patient's refusal with a mandatory reason. No consent is created.
 * A refusal needs no record selection, so a category-first request can be
 * declined before the patient chooses anything. When records were already
 * named they are still validated, so a tampered request can never be silently
 * accepted as the patient's own.
 */
export async function rejectAccessRequest(patientId, requestId, reason) {
  const trimmedReason = String(reason ?? '').trim();
  if (!trimmedReason) {
    throw httpError(400, 'A rejection reason is required', 'REJECTION_REASON_REQUIRED');
  }

  const request = await findOwnedRequest(patientId, requestId);
  const existing = (request.requestedRecords ?? []).map((recordId) => String(recordId));
  const recordCount = existing.length > 0 ? (await assertRecordsOwned(patientId, existing)).length : 0;

  request.status = 'rejected';
  request.patientResponseDate = new Date();
  request.rejectionReason = trimmedReason;
  await request.save();

  await recordActivity({
    actorId: patientId,
    actorRole: 'patient',
    action: 'access_request.rejected',
    description: `Access request from doctor ${request.doctorId} rejected`,
    targetType: 'AccessRequest',
    targetId: request._id,
    metadata: { status: 'rejected', recordCount, reason: trimmedReason },
  });

  await notifyDoctor(request.doctorId, {
    title: 'Access request declined',
    message: `A patient declined your access request: ${trimmedReason}`,
    notificationType: 'consent_rejected',
    relatedEntityType: 'AccessRequest',
    relatedEntityId: request._id,
  });

  return reloadRequest(request._id, patientId);
}

// --- consents ----------------------------------------------------------------

/** GET /api/v1/patient/consents */
export async function listActiveConsents(patientId, query = {}) {
  const pagination = parsePagination(query);
  const now = new Date();
  const filter = { patientId };

  if (query.status === 'expired') {
    filter.status = 'active';
    filter.expiresAt = { $lte: now };
  } else if (query.status === 'active') {
    filter.status = 'active';
    filter.expiresAt = { $gt: now };
  } else if (query.status) {
    if (!['revoked'].includes(query.status)) {
      throw httpError(400, 'Unsupported consent status filter', 'INVALID_CONSENT_STATUS');
    }
    filter.status = query.status;
  }

  const [consents, total] = await Promise.all([
    Consent.find(filter)
      .sort({ expiresAt: 1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('doctorId', DOCTOR_POPULATE)
      .populate('authorizedRecords', 'recordTitle category reportDate patientId recordStatus')
      .lean(),
    Consent.countDocuments(filter),
  ]);

  const safe = consents.map((consent) => toSafeConsent(consent, patientId, now));

  return {
    consents: safe,
    counts: {
      total,
      active: safe.filter((consent) => consent.status === 'active').length,
      expiringSoon: safe.filter(
        (consent) =>
          consent.status === 'active' &&
          new Date(consent.expiresAt).getTime() - now.getTime() <= EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).length,
      blockchainBacked: safe.filter((consent) => consent.blockchainBacked).length,
    },
    pagination: paginationMeta(pagination, total),
  };
}

// --- consent history ---------------------------------------------------------

const DECISION_FILTERS = new Set(['granted', 'revoked', 'expired', 'rejected']);

/**
 * GET /api/v1/patient/consent-history
 *
 * A unified, read-only history of the patient's consent events and their own
 * access-request decisions. The two are always distinguishable: only a real
 * Consent record can carry a transaction reference.
 */
export async function listConsentHistory(patientId, query = {}) {
  const pagination = parsePagination(query);
  const decisionFilter = String(query.decision ?? '').trim().toLowerCase();
  const now = new Date();

  const [consents, decidedRequests] = await Promise.all([
    Consent.find({ patientId })
      .sort({ grantedAt: -1 })
      .limit(HISTORY_SCAN_LIMIT)
      .populate('doctorId', DOCTOR_POPULATE)
      .populate('authorizedRecords', 'recordTitle category reportDate patientId recordStatus')
      .lean(),
    AccessRequest.find({ patientId, status: { $in: ['approved', 'rejected'] } })
      .sort({ patientResponseDate: -1, createdAt: -1 })
      .limit(HISTORY_SCAN_LIMIT)
      .populate('doctorId', DOCTOR_POPULATE)
      .populate('requestedRecords', REQUEST_RECORD_POPULATE)
      .lean(),
  ]);

  const consentEntries = consents.map((consent) => {
    const status = effectiveConsentStatus(consent, now);
    return {
      id: `consent:${consent._id}`,
      source: 'consent',
      doctor: toSafeDoctor(consent.doctorId),
      records: (consent.authorizedRecords ?? [])
        .map((record) => toSafeRecordSummary(record, patientId))
        .filter(Boolean),
      recordCount: (consent.authorizedRecords ?? []).length,
      purpose: consent.purpose,
      decision: status === 'revoked' ? 'revoked' : status === 'expired' ? 'expired' : 'granted',
      status,
      date: consent.grantedAt ?? consent.createdAt ?? null,
      grantedAt: consent.grantedAt ?? null,
      expiresAt: consent.expiresAt ?? null,
      rejectionReason: null,
      // Only a genuine on-chain anchor is ever surfaced.
      transactionReference: consent.transactionHash ?? null,
      blockchainBacked: Boolean(consent.transactionHash),
    };
  });

  const decisionEntries = decidedRequests.map((request) => ({
    id: `request:${request._id}`,
    source: 'access_request',
    doctor: toSafeDoctor(request.doctorId),
    records: (request.requestedRecords ?? [])
      .map((record) => toSafeRecordSummary(record, patientId))
      .filter(Boolean),
    recordCount: (request.requestedRecords ?? []).length,
    purpose: request.purpose,
    decision: request.status,
    status: request.status,
    date: request.patientResponseDate ?? request.createdAt ?? null,
    grantedAt: request.status === 'approved' ? request.patientResponseDate : null,
    expiresAt: null,
    rejectionReason: request.rejectionReason ?? null,
    // An approved request never carries a blockchain anchor.
    transactionReference: null,
    blockchainBacked: false,
  }));

  let merged = [...consentEntries, ...decisionEntries].sort((a, b) => {
    const left = a.date ? new Date(a.date).getTime() : 0;
    const right = b.date ? new Date(b.date).getTime() : 0;
    return right - left;
  });

  if (DECISION_FILTERS.has(decisionFilter)) {
    merged = merged.filter((entry) => entry.decision === decisionFilter);
  }

  const total = merged.length;
  const entries = merged.slice(pagination.skip, pagination.skip + pagination.limit);

  return {
    entries,
    counts: {
      total,
      granted: merged.filter((entry) => entry.decision === 'granted').length,
      revoked: merged.filter((entry) => entry.decision === 'revoked').length,
      expired: merged.filter((entry) => entry.decision === 'expired').length,
      rejected: merged.filter((entry) => entry.decision === 'rejected').length,
      blockchainBacked: merged.filter((entry) => entry.blockchainBacked).length,
    },
    pagination: paginationMeta(pagination, total),
  };
}

// --- access history ----------------------------------------------------------

/** GET /api/v1/patient/access-history */
export async function listAccessHistory(patientId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { patientId };

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
      .populate('doctorId', DOCTOR_POPULATE)
      .populate('medicalRecordId', 'recordTitle category')
      .lean(),
    AccessLog.countDocuments(filter),
    AccessLog.countDocuments({ patientId, accessResult: 'granted' }),
    AccessLog.countDocuments({ patientId, accessResult: 'denied' }),
  ]);

  return {
    entries: entries.map(toSafeAccessLog),
    counts: { total, granted, denied },
    pagination: paginationMeta(pagination, total),
  };
}

// --- profile -----------------------------------------------------------------

/** GET /api/v1/patient/profile */
export async function getProfile(patientId) {
  const user = await User.findOne({ _id: patientId, role: 'patient' });
  if (!user) throw notFound('Patient profile not found', 'PROFILE_NOT_FOUND');
  return toSafeUser(user);
}

/**
 * PATCH /api/v1/patient/profile
 *
 * Only the editable allow-list can change. Anything else (role, statuses,
 * password hash, wallet ownership, email) is rejected explicitly rather than
 * silently ignored, so a client can never believe a protected change succeeded.
 */
export async function updateProfile(patientId, payload = {}) {
  const provided = Object.keys(payload ?? {});
  const protectedAttempt = provided.filter((field) => PROTECTED_PROFILE_FIELDS.includes(field));
  if (protectedAttempt.length > 0) {
    const field = protectedAttempt[0];
    const code = field === 'email' ? 'EMAIL_CHANGE_NOT_SUPPORTED' : 'PROTECTED_FIELD';
    throw httpError(400, `"${field}" cannot be changed through this endpoint`, code);
  }

  const updates = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
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
    patientId,
    { $set: updates },
    { new: true, runValidators: true, context: 'query' }
  );
  if (!user) throw notFound('Patient profile not found', 'PROFILE_NOT_FOUND');

  await recordActivity({
    actorId: patientId,
    actorRole: 'patient',
    action: 'patient.profile_updated',
    description: `Patient updated profile fields: ${Object.keys(updates).join(', ')}`,
    targetType: 'User',
    targetId: user._id,
    // Field names only - no values, no credentials, no documents.
    metadata: { fields: Object.keys(updates) },
  });

  return toSafeUser(user);
}

// --- notifications -----------------------------------------------------------

/** GET /api/v1/patient/notifications */
export async function listNotifications(patientId, query = {}) {
  const pagination = parsePagination(query);
  const filter = { recipientId: patientId };

  const unreadOnly = String(query.unread ?? '').toLowerCase();
  if (unreadOnly === 'true' || unreadOnly === '1') filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientId: patientId, isRead: false }),
  ]);

  return {
    notifications: notifications.map(toSafeNotification),
    unreadCount,
    pagination: paginationMeta(pagination, total),
  };
}

/** PATCH /api/v1/patient/notifications/:id/read */
export async function markNotificationRead(patientId, notificationId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw httpError(400, 'Invalid notification id', 'INVALID_NOTIFICATION_ID');
  }

  // Scoped by recipientId: another user's notification is a 404, never a 403
  // that would confirm the id exists.
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: patientId },
    { $set: { isRead: true } },
    { new: true }
  ).lean();

  if (!notification) throw notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');

  const unreadCount = await Notification.countDocuments({ recipientId: patientId, isRead: false });
  return { notification: toSafeNotification(notification), unreadCount };
}

/** PATCH /api/v1/patient/notifications/read-all */
export async function markAllNotificationsRead(patientId) {
  const result = await Notification.updateMany(
    { recipientId: patientId, isRead: false },
    { $set: { isRead: true } }
  );
  return { updated: result.modifiedCount ?? 0, unreadCount: 0 };
}

export default {
  EXPIRING_WINDOW_DAYS,
  PROTECTED_PROFILE_FIELDS,
  EDITABLE_PROFILE_FIELDS,
  parsePagination,
  toSafeRecord,
  toSafeDoctor,
  toSafeRequest,
  toSafeConsent,
  toSafeNotification,
  effectiveConsentStatus,
  getDashboard,
  listRecords,
  getRecordById,
  createMedicalRecord,
  getRecordDocument,
  listAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  listActiveConsents,
  listConsentHistory,
  listAccessHistory,
  getProfile,
  updateProfile,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
