import { Router } from 'express';
import { body, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import {
  accessHistory,
  approveRequest,
  consentHistory,
  dashboard,
  downloadMedicalRecord,
  getMedicalRecord,
  grantConsent,
  listConsents,
  listMedicalRecords,
  listRequests,
  notifications,
  patientAccess,
  prepareGrant,
  prepareRevoke,
  profile,
  readAllNotifications,
  readNotification,
  rejectRequest,
  revokeConsent,
  updatePatientProfile,
  uploadMedicalRecord,
} from '../controllers/patient.controller.js';
import { requireAuth, requirePatient } from '../middleware/auth.middleware.js';
import { uploadMedicalDocument } from '../middleware/upload.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { RECORD_CATEGORIES } from '../models/MedicalRecord.js';
import { BLOOD_GROUPS, GENDERS } from '../models/User.js';

/**
 * Patient portal API (Phase 5) - mounted at /api/v1/patient.
 *
 * EVERY route on this router is behind `requireAuth` + `requirePatient`, so an
 * unauthenticated caller gets 401 and a doctor/admin gets 403. The patient id is
 * always taken from the session; no route accepts a patient id from the client.
 *
 * Phase 8 adds the two encrypted-file routes: `POST /records` (upload) and
 * `GET /records/:id/download` (decrypt + verify + stream). There is still no
 * preview or deletion route, and nothing here touches the blockchain - on-chain
 * consent remains Phase 9.
 */

const router = Router();

// A valid mobile number, identical to the rule used at registration.
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

const GENDER_VALUES = GENDERS.filter(Boolean);
const BLOOD_GROUP_VALUES = BLOOD_GROUPS.filter(Boolean);

// Every route below requires an authenticated patient session.
router.use(requireAuth, requirePatient);

/** Shared pagination rules. Empty values are ignored rather than rejected. */
const paginationRules = [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50'),
];

const dateRangeRules = [
  query('from').optional({ values: 'falsy' }).isISO8601().withMessage('from must be an ISO date'),
  query('to').optional({ values: 'falsy' }).isISO8601().withMessage('to must be an ISO date'),
];

/** Metadata rules for a medical document upload (multipart fields). */
const uploadRecordRules = [
  body('recordTitle')
    .trim()
    .isLength({ min: 3, max: 160 })
    .withMessage('Record title must be between 3 and 160 characters'),
  body('category')
    .trim()
    .isIn(RECORD_CATEGORIES)
    .withMessage('Record category is not supported'),
  body('hospitalName')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Hospital or clinic name is required'),
  body('doctorName')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 120 })
    .withMessage('Doctor name is too long'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be at most 1000 characters'),
  body('reportDate')
    .trim()
    .notEmpty()
    .withMessage('A report date is required')
    .bail()
    .isISO8601()
    .withMessage('Report date must be a valid ISO date'),
];

/**
 * Downloads decrypt a medical document, so they are throttled more tightly than
 * the global API limit to slow down any attempt to enumerate or harvest files.
 */
const downloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many download attempts. Please try again later.' },
});

// --- Role guard probe (retained from Phase 4 so existing tests keep passing) --
router.get('/access', patientAccess);

// --- Dashboard ---------------------------------------------------------------
router.get('/dashboard', dashboard);

// --- Medical records --------------------------------------------------------
router.get(
  '/records',
  [
    ...paginationRules,
    ...dateRangeRules,
    query('sortBy')
      .optional({ values: 'falsy' })
      .isIn(['reportDate', 'createdAt', 'uploadedAt'])
      .withMessage('sortBy must be reportDate or createdAt'),
    query('sortOrder')
      .optional({ values: 'falsy' })
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be asc or desc'),
    query('search').optional({ values: 'falsy' }).isString().isLength({ max: 120 }),
  ],
  validateRequest,
  listMedicalRecords
);

// Secure upload (Phase 8). Multer keeps the plaintext in MEMORY only, the
// metadata rules run next, and the service hashes + encrypts before anything is
// written to private storage.
router.post(
  '/records',
  uploadMedicalDocument,
  uploadRecordRules,
  validateRequest,
  uploadMedicalRecord
);

// `:id` validity is checked in the service so the client receives a precise
// INVALID_RECORD_ID code, and another patient's record is a plain 404.
router.get('/records/:id', getMedicalRecord);

// Secure retrieval: ownership is re-checked against req.user._id, the document
// is decrypted and SHA-256 verified in memory, and only then streamed.
router.get('/records/:id/download', downloadLimiter, downloadMedicalRecord);

// --- Doctor access requests --------------------------------------------------
router.get(
  '/requests',
  [
    ...paginationRules,
    query('status')
      .optional({ values: 'falsy' })
      .isIn(['pending', 'approved', 'rejected', 'cancelled'])
      .withMessage('status filter is not supported'),
  ],
  validateRequest,
  listRequests
);

router.patch(
  '/requests/:id/approve',
  [
    // Phase 6 category-first: the patient supplies the ids of their OWN records
    // they are willing to share. Optional so the Phase 5 record-first flow,
    // where the request already names the records, keeps working unchanged.
    body('recordIds')
      .optional()
      .isArray({ min: 1 })
      .withMessage('recordIds must be a non-empty array')
      .bail()
      .custom((ids) => ids.every((id) => mongoose.isValidObjectId(id)))
      .withMessage('Every record id must be valid'),
  ],
  validateRequest,
  approveRequest
);

router.patch(
  '/requests/:id/reject',
  [
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('A rejection reason is required')
      .bail()
      .isLength({ min: 3, max: 500 })
      .withMessage('Rejection reason must be between 3 and 500 characters'),
  ],
  validateRequest,
  rejectRequest
);

// --- Consents ----------------------------------------------------------------
router.get(
  '/consents',
  [
    ...paginationRules,
    query('status')
      .optional({ values: 'falsy' })
      .isIn(['active', 'revoked', 'expired'])
      .withMessage('status filter is not supported'),
  ],
  validateRequest,
  listConsents
);

// --- Phase 9: Blockchain consent grant & revocation -------------------------
router.post(
  '/consents/prepare',
  [
    body('requestId').isMongoId().withMessage('Valid access request ID is required'),
    body('selectedRecordIds')
      .optional()
      .isArray()
      .withMessage('selectedRecordIds must be an array of IDs'),
    body('durationDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('durationDays must be between 1 and 365'),
  ],
  validateRequest,
  prepareGrant
);

router.post(
  '/consents/grant',
  [
    body('requestId').isMongoId().withMessage('Valid access request ID is required'),
    body('transactionHash')
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Valid 0x-prefixed 64-character transaction hash is required'),
    body('selectedRecordIds')
      .isArray({ min: 1 })
      .withMessage('At least one authorized record ID is required'),
  ],
  validateRequest,
  grantConsent
);

router.get(
  '/consents/:id/revoke/prepare',
  prepareRevoke
);

router.post(
  '/consents/:id/revoke',
  [
    body('transactionHash')
      .optional({ values: 'falsy' })
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Valid transaction hash format required'),
  ],
  validateRequest,
  revokeConsent
);

// --- Consent history ---------------------------------------------------------
router.get(
  '/consent-history',
  [
    ...paginationRules,
    query('decision')
      .optional({ values: 'falsy' })
      .isIn(['granted', 'revoked', 'expired', 'rejected'])
      .withMessage('decision filter is not supported'),
  ],
  validateRequest,
  consentHistory
);

// --- Medical record access history -------------------------------------------
router.get(
  '/access-history',
  [
    ...paginationRules,
    ...dateRangeRules,
    query('result')
      .optional({ values: 'falsy' })
      .isIn(['granted', 'denied'])
      .withMessage('result filter must be granted or denied'),
  ],
  validateRequest,
  accessHistory
);

// --- Profile -----------------------------------------------------------------
router.get('/profile', profile);

router.patch(
  '/profile',
  [
    body('fullName')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ min: 2, max: 120 })
      .withMessage('Full name must be between 2 and 120 characters'),
    body('mobileNumber')
      .optional({ values: 'falsy' })
      .trim()
      .matches(MOBILE_PATTERN)
      .withMessage('Mobile number is not valid'),
    body('dateOfBirth')
      .optional({ values: 'falsy' })
      .isISO8601()
      .withMessage('Date of birth must be a valid ISO date')
      .bail()
      .custom((value) => new Date(value).getTime() <= Date.now())
      .withMessage('Date of birth cannot be in the future'),
    body('gender')
      .optional({ values: 'falsy' })
      .isIn(GENDER_VALUES)
      .withMessage(`Gender must be one of: ${GENDER_VALUES.join(', ')}`),
    body('bloodGroup')
      .optional({ values: 'falsy' })
      .isIn(BLOOD_GROUP_VALUES)
      .withMessage(`Blood group must be one of: ${BLOOD_GROUP_VALUES.join(', ')}`),
    body('address')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 300 })
      .withMessage('Address must be at most 300 characters'),
    body('emergencyContact')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 120 })
      .withMessage('Emergency contact must be at most 120 characters'),
    // A reference only - never an arbitrary local file path and never an upload.
    body('profilePhoto')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 500 })
      .withMessage('Profile photo reference is too long')
      .bail()
      .matches(/^https?:\/\//i)
      .withMessage('Profile photo must be an http(s) reference'),
  ],
  validateRequest,
  updatePatientProfile
);

// --- Notifications -----------------------------------------------------------
router.get('/notifications', [...paginationRules], validateRequest, notifications);

// Declared before the parameterised route for clarity; the paths do not overlap.
router.patch('/notifications/read-all', readAllNotifications);

router.patch('/notifications/:id/read', readNotification);

export default router;
