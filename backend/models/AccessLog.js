import mongoose from 'mongoose';

export const ACCESS_RESULTS = ['granted', 'denied'];

/**
 * Append-only audit trail of every attempt to read a medical record.
 * There are deliberately no updatedAt/createdAt fields: an access event is
 * immutable and `accessedAt` is its single source of truth.
 */
const accessLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient reference is required'],
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor reference is required'],
      index: true,
    },
    medicalRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalRecord',
      required: [true, 'Medical record reference is required'],
      index: true,
    },
    accessedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    accessResult: {
      type: String,
      required: [true, 'Access result is required'],
      enum: { values: ACCESS_RESULTS, message: 'Access result must be granted or denied' },
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [300, 'Reason must be at most 300 characters'],
      default: null,
    },
    // IPv4 or IPv6 textual address (45 characters covers the IPv6 maximum).
    ipAddress: {
      type: String,
      trim: true,
      maxlength: [45, 'IP address is too long'],
      default: null,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// --- Indexes -----------------------------------------------------------------
accessLogSchema.index({ patientId: 1, accessedAt: -1 });
accessLogSchema.index({ doctorId: 1, accessedAt: -1 });
accessLogSchema.index({ medicalRecordId: 1, accessedAt: -1 });
accessLogSchema.index({ accessResult: 1, accessedAt: -1 });

const AccessLog = mongoose.model('AccessLog', accessLogSchema);

export default AccessLog;
