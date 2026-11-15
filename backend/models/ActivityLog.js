import mongoose from 'mongoose';

export const ACTOR_ROLES = ['patient', 'doctor', 'admin', 'system'];

/**
 * Keys that must never be persisted in an activity log.
 * The guard below is a safety net so a careless `metadata: { ... }` call cannot
 * leak credentials or encryption material into the audit trail.
 */
const FORBIDDEN_METADATA_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'privatekey',
  'authorization',
  'encryptionkey',
  'masterencryptionkey',
];

function containsForbiddenKey(value) {
  if (value == null || typeof value !== 'object') return false;

  return Object.entries(value).some(([key, nested]) => {
    if (FORBIDDEN_METADATA_KEYS.includes(String(key).toLowerCase())) return true;
    if (Array.isArray(nested)) return nested.some(containsForbiddenKey);
    return containsForbiddenKey(nested);
  });
}

/**
 * System / user activity trail used by the admin audit screens.
 * Never stores passwords, tokens, encryption keys or medical document contents.
 */
const activityLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      required: [true, 'Actor role is required'],
      enum: { values: ACTOR_ROLES, message: 'Actor role is not valid' },
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      maxlength: [80, 'Action must be at most 80 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
    },
    targetType: {
      type: String,
      required: [true, 'Target type is required'],
      trim: true,
      maxlength: [60, 'Target type must be at most 60 characters'],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      validate: {
        validator: (value) => !containsForbiddenKey(value),
        message: 'Activity log metadata must not contain credentials or secrets',
      },
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// --- Indexes -----------------------------------------------------------------
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ actorId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;
