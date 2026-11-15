import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getNonce,
  verifySignature,
  getStatus,
  disconnect,
} from '../controllers/wallet.controller.js';

const router = Router();

// All wallet endpoints require an authenticated session
router.use(requireAuth);

router.get('/nonce', getNonce);
router.post('/verify', verifySignature);
router.get('/status', getStatus);
router.post('/disconnect', disconnect);

export default router;
