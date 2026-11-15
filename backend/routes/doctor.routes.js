import { Router } from 'express';
import { body, query } from 'express-validator';

import {
  accessHistory,
  accessibleRecords,
  certificateStatus,
  dashboard,
  downloadMedicalRecordForDoctor,
  notifications,
  patients,
  profile,
  readAllNotifications,
  readNotification,
  requests,
  submitRequest,
  updateDoctorProfile,
  uploadCertificate,
} from '../controllers/doctor.controller.js';
import { requireAuth, requireRole, requireVerifiedDoctor } from '../middleware/auth.middleware.js';
import { uploadCertificateDocument } from '../middleware/upload.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { ACCESS_REQUEST_CATEGORIES, ACCESS_REQUEST_STATUSES } from '../models/AccessRequest.js';

/**
 * Doctor portal API (Phase 6 & Phase 8) - mounted at /api/v1/doctor.
 *
 * Certificate routes are open to any authenticated doctor (`requireRole('doctor')`),
 * including doctors awaiting admin verification.
 * Clinical and patient-data routes require `requireAuth` + `requireVerifiedDoctor`.
 * Medical document downloads are explicitly denied until Phase 9 blockchain-backed consent.
 */

const router = Router();

// A valid mobile number, identical to the rule used at registration.
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

const CATEGORY_VALUES = ACCESS_REQUEST_CATEGORIES;

// --- Verification certificate (Phase 8) --------------------------------------
// Available to any authenticated doctor (including pending verification).
router.post(
  '/certificate',
  requireAuth,
  requireRole('doctor'),
  uploadCertificateDocument,
  uploadCertificate
);

router.get(
  '/certificate',
  requireAuth,
  requireRole('doctor'),
  certificateStatus
);

// Every clinical route below requires an authenticated, verified, active doctor.
router.use(requireAuth, requireVerifiedDoctor);

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

/** A category list may arrive as `categories` or `requestedCategories`. */
function categoryRules(field) {
  return [
    body(field)
      .optional({ values: 'falsy' })
      .isArray({ min: 1 })
      .withMessage('Select at least one record category')
      .bail()
      .custom((list) => list.every((value) => CATEGORY_VALUES.includes(value)))
      .withMessage(`Record categories must be one of: ${CATEGORY_VALUES.join(', ')}`),
  ];
}

// --- Dashboard ---------------------------------------------------------------
router.get('/dashboard', dashboard);

// --- Patient directory -------------------------------------------------------
router.get(
  '/patients',
  [...paginationRules, query('search').optional({ values: 'falsy' }).isString().isLength({ max: 120 })],
  validateRequest,
  patients
);

// --- Access requests ---------------------------------------------------------
router.post(
  '/requests',
  [
    body('patientId').trim().notEmpty().withMessage('Patient id is required'),
    body('purpose')
      .trim()
      .isLength({ min: 10, max: 600 })
      .withMessage('Purpose must be between 10 and 600 characters'),
    body('requestedDuration')
      .notEmpty()
      .withMessage('Requested duration is required')
      .bail()
      .isInt({ min: 1, max: 365 })
      .withMessage('Requested duration must be between 1 and 365 days')
      .toInt(),
    ...categoryRules('categories'),
    ...categoryRules('requestedCategories'),
  ],
  validateRequest,
  submitRequest
);

router.get(
  '/requests',
  [
    ...paginationRules,
    query('status')
      .optional({ values: 'falsy' })
      .isIn(ACCESS_REQUEST_STATUSES)
      .withMessage('status filter is not supported'),
    query('search').optional({ values: 'falsy' }).isString().isLength({ max: 120 }),
  ],
  validateRequest,
  requests
);

// --- Accessible records ------------------------------------------------------
router.get('/accessible-records', [...paginationRules], validateRequest, accessibleRecords);

// Phase 8: Doctor document delivery is explicitly denied until Phase 9 blockchain-backed consent.
router.get('/records/:id/download', downloadMedicalRecordForDoctor);

// --- Access history ----------------------------------------------------------
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
    body('specialization')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ min: 2, max: 120 })
      .withMessage('Specialization must be between 2 and 120 characters'),
    body('hospitalName')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ min: 2, max: 160 })
      .withMessage('Hospital or clinic name must be between 2 and 160 characters'),
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
  updateDoctorProfile
);

// --- Notifications -----------------------------------------------------------
router.get('/notifications', [...paginationRules], validateRequest, notifications);

// Declared before the parameterised route for clarity; the paths do not overlap.
router.patch('/notifications/read-all', readAllNotifications);

router.patch('/notifications/:id/read', readNotification);

export default router;
