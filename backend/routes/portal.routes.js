import { Router } from 'express';

import { toSafeUser } from '../services/auth.service.js';
import { requireAuth, requireVerifiedDoctor } from '../middleware/auth.middleware.js';

/**
 * Doctor role-scoped access probe.
 *
 * Phase 4 introduced role-based access control but no doctor data module yet.
 * This endpoint exists so the verified-doctor guard can be exercised end to end
 * (and is replaced by the real doctor APIs in a later phase). It returns no
 * medical data.
 *
 * The patient equivalent lives on the real Phase 5 patient router
 * (`routes/patient.routes.js`, mounted at /api/v1/patient) as GET /access.
 */

export const doctorPortalRouter = Router();
doctorPortalRouter.get('/access', requireAuth, requireVerifiedDoctor, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Verified doctor portal access granted.',
    user: toSafeUser(req.user),
  });
});

export default { doctorPortalRouter };
