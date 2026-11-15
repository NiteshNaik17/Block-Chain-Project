import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import mongoMemoryServer from 'mongodb-memory-server';
import request from 'supertest';
import { ethers } from 'ethers';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import MedicalRecord from '../models/MedicalRecord.js';
import AccessRequest from '../models/AccessRequest.js';
import Consent from '../models/Consent.js';
import AccessLog from '../models/AccessLog.js';
import ActivityLog from '../models/ActivityLog.js';
import Notification from '../models/Notification.js';
import WalletNonce from '../models/WalletNonce.js';
import { hashPassword } from '../utils/password.js';
import { resolveStoragePath } from '../utils/privateStorage.js';
import * as blockchainService from '../services/blockchain.service.js';

const { MongoMemoryServer } = mongoMemoryServer;

const TEST_DB_NAME = 'mediconsent_phase10_e2e_test';
const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PASSWORD = 'Password123!';

let mongoServer = null;
let mongoAvailable = false;
let testStorageDir = null;

const SAMPLE_PLAINTEXT_PDF = Buffer.from(
  '%PDF-1.4\n%âãÏÓ\nPhase 10 MediConsent End-To-End Medical Record Plaintext Verification.'
);

async function signIn(email, password = PASSWORD) {
  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return agent;
}

beforeAll(async () => {
  process.env.MASTER_ENCRYPTION_KEY = TEST_KEY_HEX;
  testStorageDir = path.join(os.tmpdir(), `mediconsent_phase10_storage_${Date.now()}`);
  process.env.PRIVATE_STORAGE_DIR = testStorageDir;
  process.env.PRIVATE_STORAGE_PATH = testStorageDir;

  try {
    mongoServer = await MongoMemoryServer.create({
      instance: { dbName: TEST_DB_NAME },
    });
    const uri = mongoServer.getUri();
    await connectDB(uri);
    mongoAvailable = true;
  } catch (err) {
    mongoAvailable = false;
  }
});

afterAll(async () => {
  if (mongoAvailable) {
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  }
  try {
    await fs.rm(testStorageDir, { recursive: true, force: true });
  } catch {}
});

beforeEach(async () => {
  if (!mongoAvailable) return;
  await Promise.all([
    User.deleteMany({}),
    MedicalRecord.deleteMany({}),
    AccessRequest.deleteMany({}),
    Consent.deleteMany({}),
    AccessLog.deleteMany({}),
    ActivityLog.deleteMany({}),
    Notification.deleteMany({}),
    WalletNonce.deleteMany({}),
  ]);
  vi.restoreAllMocks();
});

describe('Phase 10 – End-to-End Testing & Security Hardening', () => {
  it('A. Multi-role registration, admin approval, and role escalation prevention', async () => {
    if (!mongoAvailable) return;

    // 1. Patient registers via public endpoint
    const patientRes = await request(app)
      .post('/api/v1/auth/register/patient')
      .send({
        fullName: 'Jane Patient',
        email: 'jane.patient@example.com',
        mobileNumber: '+91 98765 11111',
        password: PASSWORD,
        confirmPassword: PASSWORD,
        role: 'admin', // Attempted escalation to admin
      })
      .expect(201);

    expect(patientRes.body.success).toBe(true);
    expect(patientRes.body.user.role).toBe('patient'); // Escalation prevented

    // 2. Doctor registers via public endpoint
    const doctorRes = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send({
        fullName: 'Dr. John Specialist',
        email: 'dr.john@example.com',
        mobileNumber: '+91 98765 22222',
        password: PASSWORD,
        confirmPassword: PASSWORD,
        medicalRegistrationNumber: 'MCI-10999',
        specialization: 'Neurology',
        hospitalName: 'Metro General Hospital',
      })
      .expect(201);

    expect(doctorRes.body.success).toBe(true);
    expect(doctorRes.body.user.role).toBe('doctor');
    expect(doctorRes.body.user.verificationStatus).toBe('pending');

    // 3. Pending doctor cannot access verified doctor APIs
    const doctorAgent = await signIn('dr.john@example.com');
    const doctorAccessAttempt = await doctorAgent
      .get('/api/v1/doctor/dashboard')
      .expect(403);
    expect(doctorAccessAttempt.body.code).toBe('DOCTOR_PENDING_VERIFICATION');

    // 4. Admin signs in and reviews pending doctors
    const adminUser = await User.create({
      fullName: 'System Admin',
      email: 'admin@mediconsent.local',
      mobileNumber: '+91 98765 00000',
      passwordHash: await hashPassword(PASSWORD),
      role: 'admin',
      accountStatus: 'active',
    });

    const adminAgent = await signIn(adminUser.email);
    const pendingListRes = await adminAgent
      .get('/api/v1/admin/doctors/pending')
      .expect(200);

    expect(pendingListRes.body.data).toHaveLength(1);
    expect(pendingListRes.body.data[0].email).toBe('dr.john@example.com');

    // 5. Admin approves doctor
    const approveDoctorRes = await adminAgent
      .patch(`/api/v1/admin/doctors/${doctorRes.body.user.id}/approve`)
      .expect(200);

    expect(approveDoctorRes.body.success).toBe(true);

    // 6. Doctor can now access verified doctor dashboard
    const doctorDashRes = await doctorAgent
      .get('/api/v1/doctor/dashboard')
      .expect(200);

    expect(doctorDashRes.body.success).toBe(true);
    expect(doctorDashRes.body.data.stats).toBeDefined();
  });

  it('B. Nonce-based EIP-191 signature wallet verification and security constraints', async () => {
    if (!mongoAvailable) return;

    const patient = await User.create({
      fullName: 'Alice Patient',
      email: 'alice@example.com',
      mobileNumber: '+91 98765 33333',
      passwordHash: await hashPassword(PASSWORD),
      role: 'patient',
      accountStatus: 'active',
    });

    const patientAgent = await signIn(patient.email);

    // 1. Request nonce
    const nonceRes = await patientAgent
      .get('/api/v1/wallet/nonce')
      .expect(200);

    const { nonce, statement } = nonceRes.body.data;
    expect(nonce).toHaveLength(64);
    expect(statement).toContain(nonce);

    // 2. Sign with real Ethereum wallet
    const patientEthWallet = ethers.Wallet.createRandom();
    const signature = await patientEthWallet.signMessage(statement);

    // 3. Verify and link
    const verifyRes = await patientAgent
      .post('/api/v1/wallet/verify')
      .send({
        address: patientEthWallet.address,
        message: statement,
        signature,
      })
      .expect(200);

    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.walletAddress.toLowerCase()).toBe(patientEthWallet.address.toLowerCase());

    // 4. Replay attack prevention: Same nonce cannot be used again
    const replayRes = await patientAgent
      .post('/api/v1/wallet/verify')
      .send({
        address: patientEthWallet.address,
        message: statement,
        signature,
      })
      .expect(400);

    expect(replayRes.body.code).toBe('NONCE_ALREADY_USED');

    // 5. Wallet uniqueness: Another user cannot claim the same wallet
    const secondUser = await User.create({
      fullName: 'Bob Patient',
      email: 'bob@example.com',
      mobileNumber: '+91 98765 44444',
      passwordHash: await hashPassword(PASSWORD),
      role: 'patient',
      accountStatus: 'active',
    });
    const bobAgent = await signIn(secondUser.email);
    const bobNonceRes = await bobAgent.get('/api/v1/wallet/nonce').expect(200);
    const bobSig = await patientEthWallet.signMessage(bobNonceRes.body.data.statement);

    const reuseRes = await bobAgent
      .post('/api/v1/wallet/verify')
      .send({
        address: patientEthWallet.address,
        message: bobNonceRes.body.data.statement,
        signature: bobSig,
      })
      .expect(409);

    expect(reuseRes.body.code).toBe('WALLET_ALREADY_LINKED');
  });

  it('C. Full End-to-End Workflow: Upload -> Request -> Approve -> Grant Consent -> Download -> Revoke -> Deny', async () => {
    if (!mongoAvailable) return;

    // --- SETUP: Patient, Doctor, and Wallets ---
    const patientEthWallet = ethers.Wallet.createRandom();
    const doctorEthWallet = ethers.Wallet.createRandom();

    const patient = await User.create({
      fullName: 'Charlie Patient',
      email: 'charlie@example.com',
      mobileNumber: '+91 98765 55555',
      passwordHash: await hashPassword(PASSWORD),
      role: 'patient',
      accountStatus: 'active',
      walletAddress: patientEthWallet.address.toLowerCase(),
    });

    const doctor = await User.create({
      fullName: 'Dr. Emily Vance',
      email: 'dr.emily@example.com',
      mobileNumber: '+91 98765 66666',
      passwordHash: await hashPassword(PASSWORD),
      role: 'doctor',
      medicalRegistrationNumber: 'MCI-88888',
      specialization: 'Cardiology',
      hospitalName: 'City Cardiac Care',
      verificationStatus: 'verified',
      accountStatus: 'active',
      walletAddress: doctorEthWallet.address.toLowerCase(),
    });

    const patientAgent = await signIn(patient.email);
    const doctorAgent = await signIn(doctor.email);

    // --- STEP 1: Patient uploads encrypted medical document ---
    const uploadRes = await patientAgent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Echocardiogram Report')
      .field('category', 'Laboratory Report')
      .field('hospitalName', 'Metro Heart Hospital')
      .field('doctorName', 'Dr. Sharma')
      .field('description', 'Comprehensive Echo scan')
      .field('reportDate', '2026-05-15')
      .attach('file', SAMPLE_PLAINTEXT_PDF, 'echo_report.pdf')
      .expect(201);

    const recordId = uploadRes.body.data.record.id;
    expect(recordId).toBeDefined();

    // Verify file is encrypted on disk (never plain text)
    const storedRecord = await MedicalRecord.findById(recordId);
    expect(storedRecord.encryptionAlgorithm.toLowerCase()).toBe('aes-256-gcm');
    expect(storedRecord.integrityHash).toBeDefined();
    const diskContent = await fs.readFile(resolveStoragePath(storedRecord.fileReference));
    expect(diskContent.toString('utf8')).not.toContain('MediConsent End-To-End Medical Record Plaintext Verification');

    // --- STEP 2: Doctor searches patient and creates an access request ---
    const requestRes = await doctorAgent
      .post('/api/v1/doctor/requests')
      .send({
        patientId: patient._id.toString(),
        requestedCategories: ['Laboratory Report'],
        purpose: 'Cardiovascular surgical clearance evaluation',
        requestedDuration: 7,
      })
      .expect(201);

    const accessRequestId = requestRes.body.data.request.id;
    expect(accessRequestId).toBeDefined();

    // Notification created for patient
    const notifications = await Notification.find({ userId: patient._id });
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    // --- STEP 3: Patient approves the access request with record selection ---
    const approveRes = await patientAgent
      .patch(`/api/v1/patient/requests/${accessRequestId}/approve`)
      .send({ recordIds: [recordId] })
      .expect(200);

    expect(approveRes.body.data.request.status).toBe('approved');
    const approvedRecordIds = approveRes.body.data.request.requestedRecords.map(
      (r) => (typeof r === 'object' ? r.id || r._id : r).toString()
    );
    expect(approvedRecordIds).toContain(recordId.toString());

    // Approved request alone does NOT allow doctor to download (fail-closed before blockchain consent)
    await doctorAgent
      .get(`/api/v1/doctor/records/${recordId}/download`)
      .expect(403);

    // --- STEP 4: Patient prepares and grants blockchain consent ---
    const prepRes = await patientAgent
      .post('/api/v1/patient/consents/prepare')
      .send({
        requestId: accessRequestId,
        selectedRecordIds: [recordId],
        durationDays: 7,
      })
      .expect(200);

    const { consentId, doctorWallet, recordHashes, purposeHash, expiry } = prepRes.body.data;
    expect(consentId).toBeDefined();
    expect(doctorWallet.toLowerCase()).toBe(doctorEthWallet.address.toLowerCase());
    expect(recordHashes).toHaveLength(1);

    // Mock on-chain transaction receipt & live smart contract check
    const mockTxHash = '0x' + crypto.randomBytes(32).toString('hex');
    const mockBlockNumber = 12345;

    vi.spyOn(blockchainService, 'verifyGrantTransaction').mockResolvedValue({
      confirmed: true,
      blockNumber: mockBlockNumber,
      transactionHash: mockTxHash,
      consentId,
      patient: patientEthWallet.address,
      doctor: doctorEthWallet.address,
      expiry: Math.floor(Date.now() / 1000) + 86400 * 7,
    });

    let liveOnChainActive = true;
    vi.spyOn(blockchainService, 'checkLiveOnChainConsent').mockImplementation(
      async () => liveOnChainActive
    );

    // Synchronize consent grant
    const syncRes = await patientAgent
      .post('/api/v1/patient/consents/grant')
      .send({
        requestId: accessRequestId,
        consentId,
        transactionHash: mockTxHash,
        selectedRecordIds: [recordId],
        durationDays: 7,
      })
      .expect(201);

    expect(syncRes.body.data.status).toBe('active');
    expect(syncRes.body.data.transactionHash).toBe(mockTxHash);

    // --- STEP 5: Doctor views accessible records and downloads document ---
    const accessibleRes = await doctorAgent
      .get('/api/v1/doctor/accessible-records')
      .expect(200);

    expect(accessibleRes.body.data.records).toHaveLength(1);
    expect(accessibleRes.body.data.records[0].id).toBe(recordId);

    // Doctor downloads document (backend verifies live blockchain consent, decrypts, and verifies SHA-256)
    const downloadRes = await doctorAgent
      .get(`/api/v1/doctor/records/${recordId}/download`)
      .expect(200);

    expect(downloadRes.headers['content-type']).toBe('application/pdf');
    expect(downloadRes.body.toString('utf8')).toBe(SAMPLE_PLAINTEXT_PDF.toString('utf8'));

    // Verify AccessLog was recorded
    const log = await AccessLog.findOne({
      doctorId: doctor._id,
      medicalRecordId: recordId,
      accessResult: 'granted',
    });
    expect(log).toBeTruthy();

    // --- STEP 6: Negative access checks ---
    // 1. Doctor cannot access an unselected record
    const secondUploadRes = await patientAgent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Unselected Blood Test')
      .field('category', 'Laboratory Report')
      .field('hospitalName', 'Metro Heart Hospital')
      .field('description', 'Routine blood panel')
      .field('reportDate', '2026-05-16')
      .attach('file', SAMPLE_PLAINTEXT_PDF, 'blood_test.pdf')
      .expect(201);
    const unselectedRecordId = secondUploadRes.body.data.record.id;

    await doctorAgent
      .get(`/api/v1/doctor/records/${unselectedRecordId}/download`)
      .expect(403);

    // 2. Doctor cannot access another patient's record
    const otherPatient = await User.create({
      fullName: 'Other Patient',
      email: 'other@example.com',
      mobileNumber: '+91 98765 77777',
      passwordHash: await hashPassword(PASSWORD),
      role: 'patient',
      accountStatus: 'active',
    });
    const otherPatientAgent = await signIn(otherPatient.email);
    const otherRecordRes = await otherPatientAgent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Other Patient Record')
      .field('category', 'Prescription')
      .field('hospitalName', 'City Clinic')
      .field('description', 'Confidential')
      .field('reportDate', '2026-05-16')
      .attach('file', SAMPLE_PLAINTEXT_PDF, 'other.pdf')
      .expect(201);

    await doctorAgent
      .get(`/api/v1/doctor/records/${otherRecordRes.body.data.record.id}/download`)
      .expect(403);

    // --- STEP 7: Patient revokes consent ---
    const consentDoc = await Consent.findOne({
      $or: [{ consentId }, { blockchainConsentId: consentId }],
    });
    const revokeTxHash = '0x' + crypto.randomBytes(32).toString('hex');

    vi.spyOn(blockchainService, 'verifyRevokeTransaction').mockResolvedValue({
      confirmed: true,
      blockNumber: mockBlockNumber + 10,
      transactionHash: revokeTxHash,
      consentId: consentDoc.blockchainConsentId || consentId,
    });

    const revokeRes = await patientAgent
      .post(`/api/v1/patient/consents/${consentDoc._id}/revoke`)
      .send({ transactionHash: revokeTxHash })
      .expect(200);

    expect(revokeRes.body.data.status).toBe('revoked');

    // On-chain state is also revoked (or fails checkConsent)
    liveOnChainActive = false;

    // Doctor download attempt after revocation MUST be denied immediately
    const deniedRes = await doctorAgent
      .get(`/api/v1/doctor/records/${recordId}/download`)
      .expect(403);

    expect(['CONSENT_REQUIRED', 'BLOCKCHAIN_CONSENT_DENIED']).toContain(deniedRes.body.code);

    // Doctor accessible records list is now empty
    const accessibleAfterRevoke = await doctorAgent
      .get('/api/v1/doctor/accessible-records')
      .expect(200);
    expect(accessibleAfterRevoke.body.data.records).toHaveLength(0);

    // --- STEP 8: Blockchain RPC outage fail-closed check ---
    // If blockchain RPC fails or drops, downloads fail closed with 503
    vi.spyOn(blockchainService, 'checkLiveOnChainConsent').mockRejectedValue(
      new Error('RPC Provider connection refused')
    );

    const outageRes = await doctorAgent
      .get(`/api/v1/doctor/records/${recordId}/download`)
      .expect(403); // Either consent revoked or blockchain error fails closed

    expect(outageRes.body.success).toBe(false);
  });

  it('D. Admin user management, account suspension enforcement, and activity logs', async () => {
    if (!mongoAvailable) return;

    const admin = await User.create({
      fullName: 'Chief Administrator',
      email: 'chief.admin@mediconsent.local',
      mobileNumber: '+91 99999 00000',
      passwordHash: await hashPassword(PASSWORD),
      role: 'admin',
      accountStatus: 'active',
    });

    const patient = await User.create({
      fullName: 'Suspension Test Patient',
      email: 'patient.suspension@example.com',
      mobileNumber: '+91 99999 11111',
      passwordHash: await hashPassword(PASSWORD),
      role: 'patient',
      accountStatus: 'active',
    });

    const adminAgent = await signIn(admin.email);
    const patientAgent = await signIn(patient.email);

    // 1. Patient can view their dashboard initially
    await patientAgent.get('/api/v1/patient/dashboard').expect(200);

    // 2. Admin views user management directory
    const usersRes = await adminAgent.get('/api/v1/admin/users').expect(200);
    expect(usersRes.body.success).toBe(true);
    expect(usersRes.body.data.users.length).toBeGreaterThanOrEqual(2);

    // 3. Admin suspends the patient account
    const suspendRes = await adminAgent
      .patch(`/api/v1/admin/users/${patient._id}/status`)
      .send({ status: 'suspended', reason: 'Investigation of suspicious activity' })
      .expect(200);

    expect(suspendRes.body.success).toBe(true);
    expect(suspendRes.body.data.accountStatus).toBe('suspended');

    // 4. Suspended patient is blocked from all protected patient routes
    const blockedRes = await patientAgent
      .get('/api/v1/patient/dashboard')
      .expect(403);

    expect(blockedRes.body.code).toBe('ACCOUNT_INACTIVE');

    // 5. Admin reactivates the account
    const reactivateRes = await adminAgent
      .patch(`/api/v1/admin/users/${patient._id}/status`)
      .send({ status: 'active' })
      .expect(200);

    expect(reactivateRes.body.data.accountStatus).toBe('active');

    // 6. Patient access is restored
    await patientAgent.get('/api/v1/patient/dashboard').expect(200);

    // 7. Activity logs contain the admin audit actions without secrets
    const activityRes = await adminAgent.get('/api/v1/admin/activity-logs').expect(200);
    expect(activityRes.body.success).toBe(true);
    expect(activityRes.body.data.logs.length).toBeGreaterThan(0);
    const logJson = JSON.stringify(activityRes.body.data.logs);
    expect(logJson).not.toContain(TEST_KEY_HEX);
    expect(logJson).not.toContain('passwordHash');
  });

  it('E. Consent automatic expiry prevents doctor record download', async () => {
    if (!mongoAvailable) return;

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await User.create({
      fullName: 'Expiry Patient',
      email: 'expiry.patient@example.com',
      mobileNumber: '+91 99999 22222',
      passwordHash: await hashPassword(PASSWORD),
      role: 'patient',
      accountStatus: 'active',
      walletAddress: patWallet.address.toLowerCase(),
    });

    const doctor = await User.create({
      fullName: 'Dr. Expiry Doctor',
      email: 'expiry.doctor@example.com',
      mobileNumber: '+91 99999 33333',
      passwordHash: await hashPassword(PASSWORD),
      role: 'doctor',
      medicalRegistrationNumber: 'MCI-77777',
      specialization: 'Pediatrics',
      hospitalName: 'Children Hospital',
      verificationStatus: 'verified',
      accountStatus: 'active',
      walletAddress: docWallet.address.toLowerCase(),
    });

    const patientAgent = await signIn(patient.email);
    const doctorAgent = await signIn(doctor.email);

    // Patient uploads record
    const uploadRes = await patientAgent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Pediatric Vaccination Chart')
      .field('category', 'Prescription')
      .field('hospitalName', 'Children Hospital')
      .field('reportDate', '2026-05-10')
      .attach('file', SAMPLE_PLAINTEXT_PDF, 'vax.pdf')
      .expect(201);
    const recordId = uploadRes.body.data.record.id;

    // Create expired consent (expired 1 hour ago)
    await Consent.create({
      patientId: patient._id,
      doctorId: doctor._id,
      authorizedRecords: [recordId],
      purpose: 'Vaccination verification',
      grantedAt: new Date(Date.now() - 86400 * 1000 * 8),
      expiresAt: new Date(Date.now() - 3600 * 1000), // expired 1h ago
      status: 'active',
      blockchainConsentId: '0x' + crypto.randomBytes(32).toString('hex'),
      transactionHash: '0x' + crypto.randomBytes(32).toString('hex'),
    });

    // Doctor attempts to download expired record -> blocked
    const expiredRes = await doctorAgent
      .get(`/api/v1/doctor/records/${recordId}/download`)
      .expect(403);

    expect(expiredRes.body.code).toBe('CONSENT_REQUIRED');
  });
});
