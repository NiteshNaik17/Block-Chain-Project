import mongoose from 'mongoose';
import { ethers } from 'ethers';

import Consent from '../models/Consent.js';
import AccessRequest from '../models/AccessRequest.js';
import MedicalRecord from '../models/MedicalRecord.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { recordActivity } from './activity.service.js';
import {
  computeRecordHash,
  computePurposeHash,
  generateConsentId,
  verifyGrantTransaction,
  verifyRevokeTransaction,
  getContractAddress,
} from './blockchain.service.js';
import { toSafeConsent } from './patient.service.js';
import { httpError } from '../utils/httpError.js';
import env from '../config/env.js';

/**
 * Prepares parameters required for the patient to sign the grantConsent transaction in MetaMask.
 */
export async function prepareConsentGrant(patientId, { requestId, selectedRecordIds, durationDays }) {
  if (!mongoose.isValidObjectId(requestId)) {
    throw httpError(400, 'Invalid access request ID', 'INVALID_REQUEST_ID');
  }

  const [patient, request] = await Promise.all([
    User.findById(patientId),
    AccessRequest.findOne({ _id: requestId, patientId }),
  ]);

  if (!patient) throw httpError(404, 'Patient account not found', 'PATIENT_NOT_FOUND');
  if (!request) throw httpError(404, 'Access request not found', 'REQUEST_NOT_FOUND');

  if (request.status !== 'approved') {
    throw httpError(
      400,
      'Access request must be approved by patient before granting on-chain consent.',
      'REQUEST_NOT_APPROVED'
    );
  }

  if (!patient.walletAddress) {
    throw httpError(
      400,
      'You must link and verify an Ethereum wallet before granting on-chain consent.',
      'PATIENT_WALLET_REQUIRED'
    );
  }

  const doctor = await User.findById(request.doctorId);
  if (!doctor || doctor.role !== 'doctor') {
    throw httpError(404, 'Doctor account not found', 'DOCTOR_NOT_FOUND');
  }

  if (doctor.accountStatus !== 'active' || doctor.verificationStatus !== 'verified') {
    throw httpError(
      403,
      'Doctor is not verified by an administrator. Consent can only be granted to verified doctors.',
      'DOCTOR_NOT_VERIFIED'
    );
  }

  if (!doctor.walletAddress) {
    throw httpError(
      400,
      'The doctor has not linked a verified Ethereum wallet yet. Contact the doctor to link their wallet first.',
      'DOCTOR_WALLET_REQUIRED'
    );
  }

  // Determine records to authorize
  const recordIds = Array.isArray(selectedRecordIds) && selectedRecordIds.length > 0
    ? selectedRecordIds
    : (request.requestedRecords || []);

  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    throw httpError(400, 'Select at least one medical record to authorize.', 'RECORDS_REQUIRED');
  }

  // Validate ownership of all selected records
  const ownedRecords = await MedicalRecord.find({
    _id: { $in: recordIds },
    patientId,
    recordStatus: { $ne: 'deleted' },
  });

  if (ownedRecords.length !== recordIds.length) {
    throw httpError(
      403,
      'One or more selected records do not exist or do not belong to you.',
      'RECORD_OWNERSHIP_INVALID'
    );
  }

  const duration = Number(durationDays) || request.requestedDuration || 7;
  const expiry = Math.floor(Date.now() / 1000) + duration * 86400;

  const recordHashes = recordIds.map(computeRecordHash);
  const purposeHash = computePurposeHash(request.purpose);
  const consentId = generateConsentId(patient.walletAddress, doctor.walletAddress, request._id);

  return {
    consentId,
    doctorWallet: ethers.getAddress(doctor.walletAddress),
    patientWallet: ethers.getAddress(patient.walletAddress),
    recordHashes,
    purposeHash,
    expiry,
    durationDays: duration,
    contractAddress: getContractAddress(),
    chainId: env.chainId,
    recordCount: recordIds.length,
    doctor: {
      id: String(doctor._id),
      fullName: doctor.fullName,
      specialization: doctor.specialization,
      hospitalName: doctor.hospitalName,
      walletAddress: doctor.walletAddress,
    },
  };
}

/**
 * Synchronizes and persists a confirmed on-chain consent grant into MongoDB.
 * Implements safe idempotency/reconciliation so duplicate calls with the same txHash succeed safely.
 */
export async function synchronizeConsentGrant(
  patientId,
  { requestId, consentId, transactionHash, selectedRecordIds, durationDays }
) {
  if (!transactionHash || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
    throw httpError(400, 'A valid transaction hash is required', 'INVALID_TRANSACTION_HASH');
  }

  // Idempotency: If this transaction hash is already registered in MongoDB, return the existing consent safely
  const existingConsent = await Consent.findOne({ transactionHash })
    .populate('doctorId', 'fullName specialization hospitalName walletAddress email')
    .populate('authorizedRecords', 'recordTitle category reportDate patientId recordStatus');

  if (existingConsent) {
    return {
      consent: toSafeConsent(existingConsent, patientId),
      reconciled: true,
      message: 'Consent was already synchronized successfully.',
    };
  }

  const prep = await prepareConsentGrant(patientId, { requestId, selectedRecordIds, durationDays });

  // Verify the mined transaction receipt and emitted event on the live blockchain
  const verifiedTx = await verifyGrantTransaction(transactionHash, {
    expectedConsentId: consentId || prep.consentId,
    expectedPatient: prep.patientWallet,
    expectedDoctor: prep.doctorWallet,
    expectedRecordHashes: prep.recordHashes,
    expectedExpiry: prep.expiry,
  });

  const recordIds = Array.isArray(selectedRecordIds) && selectedRecordIds.length > 0
    ? selectedRecordIds
    : prep.recordHashes.map((_, i) => selectedRecordIds[i]);

  const request = await AccessRequest.findById(requestId);

  const consent = await Consent.create({
    patientId,
    doctorId: request.doctorId,
    accessRequestId: request._id,
    authorizedRecords: selectedRecordIds,
    purpose: request.purpose,
    grantedAt: new Date(),
    expiresAt: new Date(verifiedTx.expiry * 1000),
    status: 'active',
    blockchainConsentId: verifiedTx.consentId,
    transactionHash: verifiedTx.transactionHash,
    chainId: env.chainId,
    contractAddress: getContractAddress(),
    blockNumber: verifiedTx.blockNumber,
  });

  await recordActivity({
    actorId: patientId,
    actorRole: 'patient',
    action: 'consent.granted',
    description: `Granted blockchain consent ${verifiedTx.consentId} for ${selectedRecordIds.length} record(s) on-chain (tx: ${verifiedTx.transactionHash})`,
    targetType: 'Consent',
    targetId: consent._id,
    metadata: {
      consentId: verifiedTx.consentId,
      transactionHash: verifiedTx.transactionHash,
      doctorWallet: prep.doctorWallet,
      recordCount: selectedRecordIds.length,
    },
  });

  await Notification.create({
    userId: request.doctorId,
    title: 'Blockchain consent granted',
    message: `A patient has granted on-chain consent for ${selectedRecordIds.length} medical record(s) (Tx: ${verifiedTx.transactionHash.slice(0, 10)}...).`,
    notificationType: 'consent_granted',
    relatedEntityType: 'Consent',
    relatedEntityId: consent._id,
  }).catch(() => {});

  const populated = await Consent.findById(consent._id)
    .populate('doctorId', 'fullName specialization hospitalName walletAddress email')
    .populate('authorizedRecords', 'recordTitle category reportDate patientId recordStatus');

  return {
    consent: toSafeConsent(populated, patientId),
    reconciled: false,
    message: 'Blockchain consent granted and synchronized successfully.',
  };
}

/**
 * Prepares parameters required for the patient to sign a revocation transaction in MetaMask.
 */
export async function prepareConsentRevocation(patientId, consentIdOrMongoId) {
  const filter = mongoose.isValidObjectId(consentIdOrMongoId)
    ? { _id: consentIdOrMongoId, patientId }
    : { blockchainConsentId: consentIdOrMongoId, patientId };

  const consent = await Consent.findOne(filter);
  if (!consent) throw httpError(404, 'Consent record not found', 'CONSENT_NOT_FOUND');

  if (consent.status === 'revoked') {
    throw httpError(400, 'This consent is already revoked.', 'CONSENT_ALREADY_REVOKED');
  }

  const patient = await User.findById(patientId);
  if (!patient.walletAddress) {
    throw httpError(400, 'Patient wallet must be connected to revoke consent.', 'PATIENT_WALLET_REQUIRED');
  }

  return {
    consentId: consent.blockchainConsentId,
    mongoId: String(consent._id),
    contractAddress: getContractAddress(),
    chainId: env.chainId,
    patientWallet: ethers.getAddress(patient.walletAddress),
  };
}

/**
 * Synchronizes an on-chain consent revocation with MongoDB.
 */
export async function synchronizeConsentRevocation(patientId, consentIdOrMongoId, { transactionHash }) {
  const filter = mongoose.isValidObjectId(consentIdOrMongoId)
    ? { _id: consentIdOrMongoId, patientId }
    : { blockchainConsentId: consentIdOrMongoId, patientId };

  const consent = await Consent.findOne(filter);
  if (!consent) throw httpError(404, 'Consent record not found', 'CONSENT_NOT_FOUND');

  if (consent.status === 'revoked') {
    return {
      consent: toSafeConsent(consent, patientId),
      alreadyRevoked: true,
      message: 'Consent was already recorded as revoked.',
    };
  }

  const patient = await User.findById(patientId);

  // If transaction hash provided, verify event on-chain
  if (transactionHash) {
    await verifyRevokeTransaction(transactionHash, {
      expectedConsentId: consent.blockchainConsentId,
      expectedPatient: patient.walletAddress,
    });
  }

  consent.status = 'revoked';
  consent.revokedAt = new Date();
  if (transactionHash) {
    consent.revocationTransactionHash = transactionHash;
  }
  await consent.save();

  await recordActivity({
    actorId: patientId,
    actorRole: 'patient',
    action: 'consent.revoked',
    description: `Revoked blockchain consent ${consent.blockchainConsentId} (tx: ${transactionHash || 'direct'})`,
    targetType: 'Consent',
    targetId: consent._id,
    metadata: {
      consentId: consent.blockchainConsentId,
      transactionHash: transactionHash || null,
    },
  });

  await Notification.create({
    userId: consent.doctorId,
    title: 'Consent revoked by patient',
    message: 'A patient has revoked access consent for their medical record(s) on-chain.',
    notificationType: 'consent_revoked',
    relatedEntityType: 'Consent',
    relatedEntityId: consent._id,
  }).catch(() => {});

  const populated = await Consent.findById(consent._id)
    .populate('doctorId', 'fullName specialization hospitalName walletAddress email')
    .populate('authorizedRecords', 'recordTitle category reportDate patientId recordStatus');

  return {
    consent: toSafeConsent(populated, patientId),
    message: 'Consent revoked successfully on-chain and updated in records.',
  };
}

export default {
  prepareConsentGrant,
  synchronizeConsentGrant,
  prepareConsentRevocation,
  synchronizeConsentRevocation,
};
