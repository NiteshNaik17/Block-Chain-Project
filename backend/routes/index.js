import { Router } from 'express';

import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import patientRoutes from './patient.routes.js';
import doctorRoutes from './doctor.routes.js';
import walletRoutes from './wallet.routes.js';
import { doctorPortalRouter } from './portal.routes.js';

/**
 * Root API router. Registered in app.js as `app.use('/api', apiRoutes)`.
 *
 * Structure:
 *   /api/health      -> unversioned liveness probe (Phase 1 contract)
 *   /api/v1/*        -> versioned API surface for all feature modules
 */

const router = Router();

// --- Unversioned liveness probe ---------------------------------------------
router.use('/health', healthRoutes);

// --- Versioned API foundation ----------------------------------------------
const v1Router = Router();

v1Router.use('/health', healthRoutes);

// --- Phase 4: authentication & role management -------------------------------
v1Router.use('/auth', authRoutes);
v1Router.use('/admin', adminRoutes);

// --- Phase 5: patient portal -------------------------------------------------
// Every patient route is mounted behind requireAuth + requireRole('patient').
v1Router.use('/patient', patientRoutes);

// --- Phase 6: doctor portal --------------------------------------------------
// The doctor role-scoped access probe (verified-doctor-only) is kept first so
// the Phase 4 guard contract keeps working; the real Phase 6 doctor APIs are
// mounted behind the same requireAuth + requireVerifiedDoctor guard.
v1Router.use('/doctor', doctorPortalRouter);
v1Router.use('/doctor', doctorRoutes);

// --- Phase 9: blockchain wallet & consent integration ------------------------
v1Router.use('/wallet', walletRoutes);

// Future phases register their modules here. Every sensitive module must sit
// behind the Phase 4 authentication + role-authorisation middleware before it
// is added, e.g.:
//
//   v1Router.use('/doctor/records', doctorRecordRoutes);
//
// No medical document upload, download or on-chain consent endpoint exists yet.

router.use('/v1', v1Router);

export default router;
