import mongoose from 'mongoose';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;
const WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const USER_ROLES = ['patient', 'doctor', 'admin'];
export const ACCOUNT_STATUSES = ['active', 'pending', 'suspended', 'rejected'];
export const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say', null];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown', null];
export const VERIFICATION_STATUSES = ['not_applicable', 'pending', 'verified', 'rejected'];

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [120, 'Full name must be at most 120 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Email address is too long'],
      match: [EMAIL_PATTERN, 'Email address is not valid'],
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
      maxlength: [20, 'Mobile number is too long'],
      match: [MOBILE_PATTERN, 'Mobile number is not valid'],
    },
    // Only ever the bcrypt hash - never a plain-text password.
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    role: {
      type: String,
      required: true,
      enum: { values: USER_ROLES, message: 'Role must be one of: patient, doctor, admin' },
      default: 'patient',
      index: true,
    },
    accountStatus: {
      type: String,
      enum: { values: ACCOUNT_STATUSES, message: 'Account status is not valid' },
      // Doctors need administrator verification before the account goes live.
      default: function defaultAccountStatus() {
        return this.role === 'doctor' ? 'pending' : 'active';
      },
      index: true,
    },
    profilePhoto: { type: String, trim: true, default: null },
    dateOfBirth: { type: Date, default: null },
    gender: {
      type: String,
      enum: { values: GENDERS, message: 'Gender is not valid' },
      default: null,
    },
    address: { type: String, trim: true, maxlength: [300, 'Address is too long'], default: null },
    emergencyContact: {
      type: String,
      trim: true,
      maxlength: [120, 'Emergency contact is too long'],
      default: null,
    },
    bloodGroup: {
      type: String,
      enum: { values: BLOOD_GROUPS, message: 'Blood group is not valid' },
      default: null,
    },

    // --- Doctor-specific fields (optional for patients) ----------------------
    medicalRegistrationNumber: {
      type: String,
      trim: true,
      maxlength: [60, 'Medical registration number is too long'],
      default: null,
      required: [
        function doctorRegistrationRequired() {
          return this.role === 'doctor';
        },
        'Medical registration number is required for doctor accounts',
      ],
    },
    specialization: {
      type: String,
      trim: true,
      maxlength: [120, 'Specialization must be at most 120 characters'],
      default: null,
      required: [
        function doctorSpecializationRequired() {
          return this.role === 'doctor';
        },
        'Specialization is required for doctor accounts',
      ],
    },
    hospitalName: {
      type: String,
      trim: true,
      maxlength: [200, 'Hospital name is too long'],
      default: null,
      required: [
        function doctorHospitalRequired() {
          return this.role === 'doctor';
        },
        'Hospital or clinic name is required for doctor accounts',
      ],
    },
    // Private storage reference of the uploaded verification certificate.
    // Internal-only: it is never serialised (see `toSafeUser`) and it is only
    // ever written by the Phase 8 certificate endpoint - a registration request
    // cannot supply it.
    certificateFileReference: { type: String, trim: true, default: null },
    // --- Doctor certificate metadata (Phase 8) -------------------------------
    // Safe metadata about the encrypted verification certificate. The file
    // itself lives in private storage as ciphertext only; the AES-GCM material
    // below is internal and never leaves the server. Kept deliberately separate
    // from patient medical records.
    certificateMetadata: {
      originalFileName: { type: String, trim: true, maxlength: [255, 'Certificate file name is too long'], default: null },
      mimeType: { type: String, trim: true, maxlength: [120, 'Certificate MIME type is too long'], default: null },
      fileSize: { type: Number, min: [0, 'Certificate size cannot be negative'], default: null },
      // SHA-256 digest of the original certificate (integrity only).
      integrityHash: {
        type: String,
        trim: true,
        lowercase: true,
        default: null,
        validate: {
          validator: (value) => value == null || value === '' || SHA256_PATTERN.test(value),
          message: 'Certificate integrity hash must be a 64-character SHA-256 hex digest',
        },
      },
      encryptionIv: { type: String, trim: true, lowercase: true, default: null },
      authTag: { type: String, trim: true, lowercase: true, default: null },
      encryptionAlgorithm: { type: String, trim: true, maxlength: [40, 'Encryption algorithm name is too long'], default: null },
      encryptionVersion: { type: Number, min: [1, 'Encryption version must be at least 1'], default: null },
      uploadedAt: { type: Date, default: null },
    },
    verificationStatus: {
      type: String,
      enum: { values: VERIFICATION_STATUSES, message: 'Verification status is not valid' },
      default: function defaultVerificationStatus() {
        return this.role === 'doctor' ? 'pending' : 'not_applicable';
      },
    },
    // Set by an administrator when a doctor application is reviewed (Phase 4).
    verifiedAt: { type: Date, default: null },
    verificationReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Verification reason must be at most 500 characters'],
      default: null,
    },
    // The administrator who last reviewed this doctor application (Phase 7).
    // A reference only - never the reviewing admin's credentials.
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    walletAddress: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      validate: {
        validator: (value) => value == null || WALLET_ADDRESS_PATTERN.test(value),
        message: 'Wallet address must be a 0x-prefixed 40-character hex string',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// --- Indexes -----------------------------------------------------------------
// Fast lookups for the admin "verify doctors" queue and role-based listings.
userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ role: 1, verificationStatus: 1 });
userSchema.index({ createdAt: -1 });
// A registration number must be unique, but only when it is actually present
// (patients store null), hence a partial unique index.
userSchema.index(
  { medicalRegistrationNumber: 1 },
  { unique: true, partialFilterExpression: { medicalRegistrationNumber: { $type: 'string' } } }
);
// Wallets must be unique across accounts when assigned (prevent linking 1 wallet to multiple accounts)
userSchema.index(
  { walletAddress: 1 },
  { unique: true, partialFilterExpression: { walletAddress: { $type: 'string' } } }
);

// Never expose the password hash or any certificate storage/crypto material
// through JSON serialisation.
userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject({ virtuals: false });
  delete obj.passwordHash;
  delete obj.certificateFileReference;
  if (obj.certificateMetadata) {
    delete obj.certificateMetadata.encryptionIv;
    delete obj.certificateMetadata.authTag;
    delete obj.certificateMetadata.encryptionAlgorithm;
    delete obj.certificateMetadata.encryptionVersion;
  }
  return obj;
};

const User = mongoose.model('User', userSchema);

export default User;
