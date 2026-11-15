import { Router } from 'express';
import { body } from 'express-validator';

import { login, logout, me, registerDoctor, registerPatient } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { loginLimiter, registerLimiter } from '../middleware/authRateLimit.middleware.js';
import { validateRequest } from '../middleware/validate.middleware.js';

const router = Router();

// --- Shared validation rules -------------------------------------------------
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
const PASSWORD_MESSAGE =
  'Password must be 8-72 characters and include an uppercase letter, a lowercase letter and a number';
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

const emailRule = body('email')
  .trim()
  .notEmpty()
  .withMessage('Email address is required')
  .bail()
  .isEmail()
  .withMessage('Enter a valid email address')
  .isLength({ max: 254 })
  .withMessage('Email address is too long');

const mobileRule = body('mobileNumber')
  .trim()
  .notEmpty()
  .withMessage('Mobile number is required')
  .bail()
  .matches(MOBILE_PATTERN)
  .withMessage('Enter a valid mobile number');

const passwordRules = [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .bail()
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be between 8 and 72 characters')
    .bail()
    .matches(PASSWORD_PATTERN)
    .withMessage(PASSWORD_MESSAGE),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Please confirm your password')
    .bail()
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
];

const patientRules = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .bail()
    .isLength({ min: 2, max: 120 })
    .withMessage('Full name must be between 2 and 120 characters'),
  emailRule,
  mobileRule,
  ...passwordRules,
];

const doctorRules = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .bail()
    .isLength({ min: 2, max: 120 })
    .withMessage('Full name must be between 2 and 120 characters'),
  emailRule,
  mobileRule,
  body('medicalRegistrationNumber')
    .trim()
    .notEmpty()
    .withMessage('Medical registration number is required')
    .bail()
    .isLength({ min: 5, max: 60 })
    .withMessage('Medical registration number must be between 5 and 60 characters'),
  body('specialization')
    .trim()
    .notEmpty()
    .withMessage('Specialization is required')
    .bail()
    .isLength({ max: 120 })
    .withMessage('Specialization must be at most 120 characters'),
  body('hospitalName')
    .trim()
    .notEmpty()
    .withMessage('Hospital or clinic name is required')
    .bail()
    .isLength({ max: 200 })
    .withMessage('Hospital or clinic name must be at most 200 characters'),
  ...passwordRules,
];

// --- Public routes -----------------------------------------------------------
// Note: there is intentionally no `/register/admin`. Public administrator
// registration must never exist; admins are provisioned by a one-time script.
router.post('/register/patient', registerLimiter, patientRules, validateRequest, registerPatient);
router.post('/register/doctor', registerLimiter, doctorRules, validateRequest, registerDoctor);

router.post(
  '/login',
  loginLimiter,
  [
    body('email').trim().notEmpty().withMessage('Email address is required').bail().isEmail().withMessage('Enter a valid email address'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  login
);

router.post('/logout', logout);

// --- Authenticated routes ----------------------------------------------------
router.get('/me', requireAuth, me);

export default router;
