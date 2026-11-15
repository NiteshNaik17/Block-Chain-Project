import rateLimit from 'express-rate-limit';

import { isTest } from '../config/env.js';

/**
 * Brute-force protection for the public authentication endpoints.
 * `express-rate-limit` is already a project dependency, so no new package.
 * The limit is effectively disabled while running the automated suite.
 */
const WINDOW_MS = 15 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Successful sign-ins must not consume the budget.
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many sign-in attempts. Please try again later.' },
});

const registerLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: isTest ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many registration attempts. Please try again later.' },
});

export { loginLimiter, registerLimiter };
