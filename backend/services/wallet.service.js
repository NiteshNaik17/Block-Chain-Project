import crypto from 'node:crypto';
import { ethers } from 'ethers';

import User from '../models/User.js';
import Consent from '../models/Consent.js';
import WalletNonce from '../models/WalletNonce.js';
import { recordActivity } from './activity.service.js';
import { httpError } from '../utils/httpError.js';
import env from '../config/env.js';

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Creates a unique random verification nonce and statement for an authenticated user.
 */
export async function createWalletNonce(userId) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

  const statement = `MediConsent Wallet Verification\n\nPlease sign this message to securely link your Ethereum wallet with your MediConsent account.\n\nNonce: ${nonce}\nDomain: ${env.clientUrl || 'http://localhost:5173'}\nExpires: ${expiresAt.toISOString()}`;

  const nonceDoc = await WalletNonce.create({
    userId,
    nonce,
    statement,
    expiresAt,
  });

  return {
    nonce: nonceDoc.nonce,
    statement: nonceDoc.statement,
    expiresAt: nonceDoc.expiresAt,
  };
}

/**
 * Verifies a cryptographic signature from MetaMask and associates the wallet with the user.
 */
export async function verifyAndLinkWallet(user, { address, message, signature }) {
  if (!address || typeof address !== 'string') {
    throw httpError(400, 'Wallet address is required', 'INVALID_WALLET_ADDRESS');
  }

  if (!message || typeof message !== 'string') {
    throw httpError(400, 'Signed verification message is required', 'MISSING_MESSAGE');
  }

  if (!signature || typeof signature !== 'string') {
    throw httpError(400, 'Cryptographic signature is required', 'MISSING_SIGNATURE');
  }

  let normalizedAddress;
  try {
    normalizedAddress = ethers.getAddress(address.trim());
  } catch {
    throw httpError(400, 'Invalid Ethereum wallet address format', 'INVALID_WALLET_ADDRESS');
  }

  // 1. Verify cryptographic signature using ethers.verifyMessage
  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature);
  } catch (sigErr) {
    throw httpError(400, 'Cryptographic signature verification failed', 'INVALID_SIGNATURE');
  }

  if (recoveredAddress.toLowerCase() !== normalizedAddress.toLowerCase()) {
    throw httpError(
      400,
      'Signature does not match the provided wallet address',
      'SIGNATURE_ADDRESS_MISMATCH'
    );
  }

  // 2. Validate nonce inside message
  const nonceMatch = message.match(/Nonce:\s*([a-fA-F0-9]{64})/);
  if (!nonceMatch) {
    throw httpError(400, 'Verification message format is invalid or missing nonce', 'INVALID_MESSAGE_FORMAT');
  }

  const nonceHex = nonceMatch[1];
  const nonceDoc = await WalletNonce.findOne({
    userId: user._id,
    nonce: nonceHex,
  });

  if (!nonceDoc) {
    throw httpError(400, 'Verification nonce not found or belongs to another account', 'INVALID_NONCE');
  }

  if (nonceDoc.consumed) {
    throw httpError(400, 'Verification nonce has already been used (replay attack prevented)', 'NONCE_ALREADY_USED');
  }

  if (nonceDoc.expiresAt.getTime() < Date.now()) {
    throw httpError(400, 'Verification nonce has expired. Please request a new nonce.', 'NONCE_EXPIRED');
  }

  // 3. Mark nonce consumed
  nonceDoc.consumed = true;
  nonceDoc.consumedAt = new Date();
  await nonceDoc.save();

  // 4. Ensure wallet is not already linked to another user account
  const existingUser = await User.findOne({
    walletAddress: normalizedAddress.toLowerCase(),
    _id: { $ne: user._id },
  });

  if (existingUser) {
    throw httpError(
      409,
      'This wallet address is already linked to another MediConsent account.',
      'WALLET_ALREADY_LINKED'
    );
  }

  // 5. If user already had a different wallet, check if active consents depend on it
  if (user.walletAddress && user.walletAddress.toLowerCase() !== normalizedAddress.toLowerCase()) {
    const roleField = user.role === 'doctor' ? 'doctorId' : 'patientId';
    const activeConsents = await Consent.countDocuments({
      [roleField]: user._id,
      status: 'active',
      expiresAt: { $gt: new Date() },
    });

    if (activeConsents > 0) {
      throw httpError(
        400,
        `Cannot replace wallet while ${activeConsents} active on-chain consent(s) depend on it. Revoke or wait for active consents to expire first.`,
        'ACTIVE_CONSENTS_DEPEND_ON_WALLET'
      );
    }
  }

  // 6. Update user wallet
  user.walletAddress = normalizedAddress.toLowerCase();
  await user.save();

  await recordActivity({
    actorId: user._id,
    actorRole: user.role,
    action: 'wallet.verified',
    description: `Verified and associated wallet ${normalizedAddress} with account`,
    targetType: 'User',
    targetId: user._id,
    metadata: { walletAddress: normalizedAddress },
  });

  return {
    verified: true,
    walletAddress: normalizedAddress,
    user: user.toJSON ? user.toJSON() : user,
  };
}

/**
 * Returns the current wallet status for the user.
 */
export async function getWalletStatus(user) {
  return {
    connected: Boolean(user.walletAddress),
    walletAddress: user.walletAddress ? ethers.getAddress(user.walletAddress) : null,
    chainId: env.chainId,
    role: user.role,
  };
}

/**
 * Disconnects the user's wallet if no active on-chain consents depend on it.
 */
export async function disconnectWallet(user) {
  if (!user.walletAddress) {
    return { disconnected: true, message: 'No wallet was connected.' };
  }

  const roleField = user.role === 'doctor' ? 'doctorId' : 'patientId';
  const activeConsents = await Consent.countDocuments({
    [roleField]: user._id,
    status: 'active',
    expiresAt: { $gt: new Date() },
  });

  if (activeConsents > 0) {
    throw httpError(
      400,
      `Cannot disconnect wallet while ${activeConsents} active on-chain consent(s) depend on it. Revoke or wait for active consents to expire first.`,
      'ACTIVE_CONSENTS_DEPEND_ON_WALLET'
    );
  }

  const oldAddress = user.walletAddress;
  user.walletAddress = null;
  await user.save();

  await recordActivity({
    actorId: user._id,
    actorRole: user.role,
    action: 'wallet.disconnected',
    description: `Disconnected wallet association (${oldAddress})`,
    targetType: 'User',
    targetId: user._id,
    metadata: { oldAddress },
  });

  return {
    disconnected: true,
    message: 'Wallet successfully disconnected from account.',
  };
}

export default {
  createWalletNonce,
  verifyAndLinkWallet,
  getWalletStatus,
  disconnectWallet,
};
