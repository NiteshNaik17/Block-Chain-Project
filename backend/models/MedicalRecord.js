import mongoose from 'mongoose';

export const RECORD_CATEGORIES = [
  'Prescription',
  'Laboratory Report',
  'X-ray Report',
  'MRI / CT Scan Report',
  'Discharge Summary',
  'Medical Certificate',
  'Other Document',
];

export const ENCRYPTION_STATUSES = ['pending', 'encrypted', 'failed'];
export const RECORD_STATUSES = ['active', 'archived', 'deleted'];

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const medicalRecordSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient reference is required'],
      index: true,
    },
    recordTitle: {
      type: String,
      required: [true, 'Record title is required'],
      trim: true,
      maxlength: [160, 'Record title must be at most 160 characters'],
    },
    category: {
      type: String,
      required: [true, 'Record category is required'],
      enum: { values: RECORD_CATEGORIES, message: 'Record category is not supported' },
    },
    hospitalName: {
      type: String,
      required: [true, 'Hospital or clinic name is required'],
      trim: true,
      maxlength: [200, 'Hospital name is too long'],
    },
    doctorName: {
      type: String,
      trim: true,
      maxlength: [120, 'Doctor name is too long'],
      default: null,
    },
    reportDate: {
      type: Date,
      required: [true, 'Report date is required'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must be at most 1000 characters'],
      default: null,
    },

    // --- Storage metadata (no document contents are ever stored in MongoDB) ---
    fileReference: {
      type: String,
      required: [true, 'File reference is required'],
      trim: true,
    },
    originalFileName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
      maxlength: [255, 'Original file name is too long'],
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      trim: true,
      maxlength: [120, 'MIME type is too long'],
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
      max: [50 * 1024 * 1024, 'File size exceeds the 50 MB limit'],
    },
    // SHA-256 digest of the stored bytes - populated during Phase 6 upload.
    integrityHash: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      validate: {
        validator: (value) => value == null || value === '' || SHA256_PATTERN.test(value),
        message: 'Integrity hash must be a 64-character SHA-256 hex digest',
      },
    },
    // --- AES-256-GCM metadata (Phase 8) -------------------------------------
    // Everything needed to decrypt the stored ciphertext. These fields are
    // optional so records created before Phase 8 (metadata-only rows) remain
    // valid. They are internal-only: `toJSON` strips them and the API never
    // serialises them.
    encryptionIv: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    authTag: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    encryptionAlgorithm: {
      type: String,
      trim: true,
      maxlength: [40, 'Encryption algorithm name is too long'],
      default: null,
    },
    encryptionVersion: {
      type: Number,
      min: [1, 'Encryption version must be at least 1'],
      default: null,
    },

    // Ciphertext payload backup for cloud deployments with ephemeral storage (Render/Heroku)
    encryptedData: {
      type: Buffer,
      default: null,
    },

    encryptionStatus: {
      type: String,
      enum: { values: ENCRYPTION_STATUSES, message: 'Encryption status is not valid' },
      default: 'pending',
    },
    recordStatus: {
      type: String,
      enum: { values: RECORD_STATUSES, message: 'Record status is not valid' },
      default: 'active',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// --- Indexes -----------------------------------------------------------------
// Patient record listing (most common query) sorted by report date.
medicalRecordSchema.index({ patientId: 1, recordStatus: 1, reportDate: -1 });
// Category filtering inside a patient's vault.
medicalRecordSchema.index({ patientId: 1, category: 1 });
// Newest-first global listing for admin/audit views.
medicalRecordSchema.index({ createdAt: -1 });

/**
 * Never expose internal storage or cryptographic material through JSON.
 * The API already returns allow-listed serialisers, so this is a second line of
 * defence: even a raw document serialised by accident loses the private storage
 * reference, the AES-GCM IV and the authentication tag.
 */
medicalRecordSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject({ virtuals: false });
  delete obj.fileReference;
  delete obj.encryptionIv;
  delete obj.authTag;
  delete obj.encryptionAlgorithm;
  delete obj.encryptionVersion;
  return obj;
};

const MedicalRecord = mongoose.model('MedicalRecord', medicalRecordSchema);

export default MedicalRecord;
