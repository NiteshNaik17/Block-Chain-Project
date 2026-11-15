import mongoose from 'mongoose';

export const CONSENT_STATUSES = ['active', 'revoked', 'expired'];

const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

/**
 * Off-chain record of a patient consent.
 *
 * The authoritative consent decision is anchored on the blockchain in Phase 9;
 * this collection is the application-side reference that mirrors it and stores
 * the readable metadata (purpose, window, authorised records).
 */
const consentSchema = new mongoose.Schema(
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
    authorizedRecords: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'MedicalRecord',
        },
      ],
      required: [true, 'At least one medical record must be authorised'],
      validate: {
        validator: (records) => Array.isArray(records) && records.length > 0,
        message: 'At least one medical record must be authorised',
      },
    },
    purpose: {
      type: String,
      required: [true, 'Consent purpose is required'],
      trim: true,
      maxlength: [600, 'Purpose must be at most 600 characters'],
    },
    grantedAt: {
      type: Date,
      required: [true, 'Grant date is required'],
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
    status: {
      type: String,
      enum: { values: CONSENT_STATUSES, message: 'Consent status is not valid' },
      default: 'active',
    },

    // --- Blockchain anchors (populated in Phase 9) --------------------------
    blockchainConsentId: {
      type: String,
      trim: true,
      maxlength: [120, 'Blockchain consent id is too long'],
      default: null,
    },
    transactionHash: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (value) => value == null || value === '' || TX_HASH_PATTERN.test(value),
        message: 'Transaction hash must be a 0x-prefixed 64-character hex string',
      },
    },
    chainId: {
      type: Number,
      default: 31337,
    },
    contractAddress: {
      type: String,
      trim: true,
      default: null,
    },
    blockNumber: {
      type: Number,
      default: null,
    },
    accessRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccessRequest',
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revocationTransactionHash: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Reject an expiry that is not strictly after the grant date.
consentSchema.pre('validate', function ensureValidWindow(next) {
  if (this.grantedAt && this.expiresAt && this.expiresAt.getTime() <= this.grantedAt.getTime()) {
    this.invalidate('expiresAt', 'Consent expiry must be after the grant date');
  }
  next();
});

// --- Indexes -----------------------------------------------------------------
// Patient "active consents" screen, ordered by what expires soonest.
consentSchema.index({ patientId: 1, status: 1, expiresAt: 1 });
// Doctor "accessible records" screen.
consentSchema.index({ doctorId: 1, status: 1, expiresAt: 1 });
// Lookup by the on-chain anchor once Phase 9 is in place.
consentSchema.index({ blockchainConsentId: 1 }, { sparse: true });
consentSchema.index({ transactionHash: 1 }, { sparse: true });

const Consent = mongoose.model('Consent', consentSchema);

export default Consent;
