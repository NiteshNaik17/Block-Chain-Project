import ActivityLog from '../models/ActivityLog.js';

/**
 * Write an audit-trail entry.
 *
 * Audit logging must never take down the request that triggered it, so failures
 * are reported without throwing. Passwords, tokens and keys are rejected by the
 * ActivityLog schema's forbidden-metadata guard.
 */
export async function recordActivity({
  actorId = null,
  actorRole = 'system',
  action,
  description,
  targetType,
  targetId = null,
  metadata = null,
}) {
  try {
    return await ActivityLog.create({
      actorId,
      actorRole,
      action,
      description,
      targetType,
      targetId,
      metadata,
    });
  } catch (error) {
    console.error('[MediConsent] Failed to record activity log:', error.message);
    return null;
  }
}

export default recordActivity;
