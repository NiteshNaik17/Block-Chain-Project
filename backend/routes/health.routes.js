import { Router } from 'express';

import { getHealth } from '../controllers/health.controller.js';

const router = Router();

/**
 * Health router. Mounted twice by routes/index.js:
 *   - GET /api/health      (unversioned liveness probe, Phase 1 contract)
 *   - GET /api/v1/health   (same payload under the versioned API)
 */
router.get('/', getHealth);

export default router;
