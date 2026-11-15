import mongoose from 'mongoose';

const walletNonceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    nonce: {
      type: String,
      required: [true, 'Nonce is required'],
      unique: true,
      index: true,
    },
    statement: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumed: {
      type: Boolean,
      default: false,
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Automatic expiration cleanup after 1 hour
walletNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const WalletNonce = mongoose.model('WalletNonce', walletNonceSchema);

export default WalletNonce;
