import mongoose from 'mongoose';

import { RECORD_CATEGORIES } from './MedicalRecord.js';

export const ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

// Re-exported so route-level validation and the frontend share one source of truth.
export { RECORD_CATEGORIES as ACCESS_REQUEST_CATEGORIES };

const accessRequestSchema = new mongoose.Schema(
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
    // Record categories the doctor is asking for. Phase 6 introduced this field
    // so a request can be created WITHOUT the doctor ever seeing (or listing) a
    // patient's private records: the patient chooses the actual records when
    // they review the request.
    requestedCategories: {
      type: [
        {
          type: String,
          enum: {
            values: RECORD_CATEGORIES,
            message: 'Requested record category is not supported',
          },
        },
      ],
      default: [],
    },
    // The specific records the patient has agreed to share. Empty while a
    // request is pending under the category-first workflow and filled in by the
    // patient (validated against their own records) when they respond.
    requestedRecords: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'MedicalRecord',
        },
      ],
      // Records are only mandatory when no categories were requested, so both
      // the Phase 5 record-first requests and Phase 6 category-first requests
      // remain valid.
      required: [
        function recordsRequiredUnlessCategories() {
          return !(Array.isArray(this.requestedCategories) && this.requestedCategories.length > 0);
        },
        'Specify at least one requested category or medical record',
      ],
      validate: {
        validator: function atLeastOneRequestedTarget(records) {
          const hasRecords = Array.isArray(records) && records.length > 0;
          const hasCategories =
            Array.isArray(this.requestedCategories) && this.requestedCategories.length > 0;
          return hasRecords || hasCategories;
        },
        message: 'Specify at least one requested category or medical record',
      },
    },
    purpose: {
      type: String,
      required: [true, 'Request purpose is required'],
      trim: true,
      maxlength: [600, 'Purpose must be at most 600 characters'],
    },
    // Requested consent window, expressed in days.
    requestedDuration: {
      type: Number,
      required: [true, 'Requested duration is required'],
      min: [1, 'Requested duration must be at least 1 day'],
      max: [365, 'Requested duration cannot exceed 365 days'],
    },
    status: {
      type: String,
      enum: { values: ACCESS_REQUEST_STATUSES, message: 'Access request status is not valid' },
      default: 'pending',
    },
    patientResponseDate: { type: Date, default: null },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason must be at most 500 characters'],
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// --- Indexes -----------------------------------------------------------------
// Patient inbox: pending requests first, newest first.
accessRequestSchema.index({ patientId: 1, status: 1, createdAt: -1 });
// Doctor outbox: "my requests" listing.
accessRequestSchema.index({ doctorId: 1, status: 1, createdAt: -1 });
// Duplicate-pending guard: "does this doctor already have a pending request for
// this patient?" (Phase 6).
accessRequestSchema.index({ doctorId: 1, patientId: 1, status: 1 });
// Admin overview of the whole approval pipeline.
accessRequestSchema.index({ status: 1, createdAt: -1 });

const AccessRequest = mongoose.model('AccessRequest', accessRequestSchema);

export default AccessRequest;
