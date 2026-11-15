import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'consent_request',
  'consent_approved',
  'consent_rejected',
  'consent_revoked',
  'access_granted',
  'access_denied',
  'record_uploaded',
  'doctor_verified',
  'doctor_rejected',
  'system',
];

/**
 * In-app notification for a single recipient.
 * Immutable once created: only `isRead` changes, so createdAt is enough.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification recipient is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [140, 'Notification title must be at most 140 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [600, 'Notification message must be at most 600 characters'],
    },
    notificationType: {
      type: String,
      required: true,
      enum: { values: NOTIFICATION_TYPES, message: 'Notification type is not valid' },
      default: 'system',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    relatedEntityType: {
      type: String,
      trim: true,
      maxlength: [60, 'Related entity type is too long'],
      default: null,
    },
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// --- Indexes -----------------------------------------------------------------
// "My unread notifications, newest first" - the only real read pattern.
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
