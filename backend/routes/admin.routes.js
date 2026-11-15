import { Router } from 'express';
import { body, param, query } from 'express-validator';

import {
  activityLogs,
  adminAccess,
  approveDoctor,
  dashboard,
  doctor,
  doctors,
  downloadDoctorCertificate,
  listPendingDoctors,
  notifications,
  patient,
  patients,
  profile,
  readAllNotifications,
  readNotification,
  rejectDoctor,
  updateAdminProfile,
  updateUserAccountStatus,
  user,
  users,
} from '../controllers/admin.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { ACTOR_ROLES } from '../models/ActivityLog.js';
import { ACCOUNT_STATUSES, USER_ROLES, VERIFICATION_STATUSES } from '../models/User.js';

/**
 * Administrator portal API (Phase 7) - mounted at /api/v1/admin.
 *
 * EVERY route on this router is behind `requireAuth` + `requireAdmin`, so:
 *   - an unauthenticated caller gets 401;
 *   - a patient or doctor gets 403 (ROLE_NOT_PERMITTED);
 *   - a suspended administrator gets 403 (ACCOUNT_INACTIVE).
 * The administrator id is always taken from the session; no route accepts an
 * administrator id from the client.
 *
 * No route here uploads, downloads, previews or returns a medical document, and
 * none of them touches the blockchain - those boundaries are Phase 8 and 9.
 */

const router = Router();

// A valid mobile number, identical to the rule used at registration.
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

// Every route below requires an authenticated, active administrator.
router.use(requireAuth, requireAdmin);

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

const sortRules = (allowed) => [
  query('sortBy').optional({ values: 'falsy' }).isIn(allowed).withMessage('sortBy is not supported'),
  query('sortOrder').optional({ values: 'falsy' }).isIn(['asc', 'desc']).withMessage('sortOrder must be asc or desc'),
];

const searchRule = query('search').optional({ values: 'falsy' }).isString().trim().isLength({ max: 120 });

const userIdRule = param('id').isMongoId().withMessage('Invalid user id');
const patientIdRule = param('id').isMongoId().withMessage('Invalid patient id');
const doctorIdRule = param('id').isMongoId().withMessage('Invalid doctor id');

// --- Guard probe -------------------------------------------------------------
router.get('/access', adminAccess);

// --- Dashboard ---------------------------------------------------------------
router.get('/dashboard', dashboard);

// --- Patients ----------------------------------------------------------------
// A `pending` segment can never collide here: `/patients/:id` is declared below
// and the id rule rejects a non-ObjectId value with a 400.
router.get(
  '/patients',
  [
    ...paginationRules,
    searchRule,
    query('accountStatus')
      .optional({ values: 'falsy' })
      .isIn(ACCOUNT_STATUSES)
      .withMessage('accountStatus filter is not supported'),
    ...sortRules(['createdAt', 'fullName', 'email', 'accountStatus']),
  ],
  validateRequest,
  patients
);

router.get('/patients/:id', [patientIdRule], validateRequest, patient);

// --- Doctor verification -----------------------------------------------------
// `/doctors/pending` is declared before `/doctors/:id`, otherwise `pending`
// would be captured as an id.
router.get('/doctors/pending', [...paginationRules, searchRule], validateRequest, listPendingDoctors);

router.get(
  '/doctors',
  [
    ...paginationRules,
    searchRule,
    query('verificationStatus')
      .optional({ values: 'falsy' })
      .isIn(VERIFICATION_STATUSES)
      .withMessage('verificationStatus filter is not supported'),
    ...sortRules(['createdAt', 'fullName', 'verificationStatus']),
  ],
  validateRequest,
  doctors
);

router.get('/doctors/:id', [doctorIdRule], validateRequest, doctor);

router.patch('/doctors/:id/approve', [doctorIdRule], validateRequest, approveDoctor);

// Secure certificate review (Phase 8): Decrypts in memory and streams for administrator verification
router.get('/doctors/:id/certificate', [doctorIdRule], validateRequest, downloadDoctorCertificate);

router.patch(
  '/doctors/:id/reject',
  [
    doctorIdRule,
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('A rejection reason is required')
      .bail()
      .isLength({ min: 3, max: 500 })
      .withMessage('Rejection reason must be between 3 and 500 characters'),
  ],
  validateRequest,
  rejectDoctor
);

// --- Users -------------------------------------------------------------------
router.get(
  '/users',
  [
    ...paginationRules,
    searchRule,
    query('role').optional({ values: 'falsy' }).isIn(USER_ROLES).withMessage('role filter is not supported'),
    query('accountStatus')
      .optional({ values: 'falsy' })
      .isIn(ACCOUNT_STATUSES)
      .withMessage('accountStatus filter is not supported'),
    ...sortRules(['createdAt', 'fullName', 'email', 'role', 'accountStatus']),
  ],
  validateRequest,
  users
);

router.get('/users/:id', [userIdRule], validateRequest, user);

router.patch(
  '/users/:id/status',
  [
    userIdRule,
    // Only an active / suspended transition is meaningful. Role and identity
    // changes are refused by the service, not silently ignored.
    body('status')
      .trim()
      .notEmpty()
      .withMessage('A status is required')
      .bail()
      .isIn(['active', 'suspended'])
      .withMessage('status must be either active or suspended'),
  ],
  validateRequest,
  updateUserAccountStatus
);

// --- Activity logs (read-only) ----------------------------------------------
router.get(
  '/activity-logs',
  [
    ...paginationRules,
    ...dateRangeRules,
    searchRule,
    query('action').optional({ values: 'falsy' }).isString().trim().isLength({ max: 80 }),
    query('actorRole')
      .optional({ values: 'falsy' })
      .isIn(ACTOR_ROLES)
      .withMessage('actorRole filter is not supported'),
  ],
  validateRequest,
  activityLogs
);

// The audit trail is append-only: no POST, PATCH or DELETE route is registered.

// --- Profile -----------------------------------------------------------------
router.get('/profile', profile);

router.patch(
  '/profile',
  [
    // Only the editable allow-list. Any other field is refused by the service.
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
  ],
  validateRequest,
  updateAdminProfile
);

// --- Notifications -----------------------------------------------------------
router.get('/notifications', [...paginationRules], validateRequest, notifications);

// Declared before the parameterised route for clarity; the paths do not overlap.
router.patch('/notifications/read-all', readAllNotifications);

router.patch('/notifications/:id/read', readNotification);

export default router;
