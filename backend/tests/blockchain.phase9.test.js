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
import WalletNonce from '../models/WalletNonce.js';
import { hashPassword } from '../utils/password.js';
import { storeEncryptedFile } from '../services/secureFile.service.js';
import * as blockchainService from '../services/blockchain.service.js';

const { MongoMemoryServer } = mongoMemoryServer;

const TEST_DB_NAME = 'mediconsent_phase9_test';
const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PASSWORD = 'Password123!';

let mongoServer = null;
let mongoAvailable = false;
let testStorageDir = null;

const SAMPLE_PDF_BUFFER = Buffer.from('%PDF-1.4\n%Test medical PDF for Phase 9 blockchain consent verification.');

async function createUser(overrides = {}) {
  return User.create({
    fullName: 'Test User',
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    mobileNumber: '+91 98765 43210',
    passwordHash: await hashPassword(PASSWORD),
    role: 'patient',
    accountStatus: 'active',
    ...overrides,
  });
}

async function createDoctor(overrides = {}) {
  return createUser({
    fullName: 'Dr. Blockchain Doctor',
    email: `doctor-${Date.now()}-${Math.random()}@example.com`,
    role: 'doctor',
    medicalRegistrationNumber: `MCI-${Math.floor(10000 + Math.random() * 90000)}`,
    specialization: 'Cardiology',
    hospitalName: 'Apollo City Hospital',
    verificationStatus: 'verified',
    accountStatus: 'active',
    ...overrides,
  });
}

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
  testStorageDir = path.join(os.tmpdir(), `mediconsent_phase9_storage_${Date.now()}`);
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
    WalletNonce.deleteMany({}),
  ]);
  vi.restoreAllMocks();
});

describe('Phase 9 – Wallet Nonce & Signature Verification', () => {
  it('1. User can request a one-time verification nonce and statement', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'pat.nonce@example.com' });
    const agent = await signIn(patient.email);

    const res = await agent.get('/api/v1/wallet/nonce');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nonce).toHaveLength(64);
    expect(res.body.data.statement).toContain('MediConsent Wallet Verification');
    expect(res.body.data.statement).toContain(res.body.data.nonce);
  });

  it('2. Valid signature links the wallet to the account; normalizes address', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'pat.sig@example.com' });
    const agent = await signIn(patient.email);

    // Request nonce
    const nonceRes = await agent.get('/api/v1/wallet/nonce');
    const { statement } = nonceRes.body.data;

    // Create random test wallet and sign
    const wallet = ethers.Wallet.createRandom();
    const signature = await wallet.signMessage(statement);

    // Verify
    const verifyRes = await agent.post('/api/v1/wallet/verify').send({
      address: wallet.address,
      message: statement,
      signature,
    });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.walletAddress.toLowerCase()).toBe(wallet.address.toLowerCase());

    const updatedUser = await User.findById(patient._id);
    expect(updatedUser.walletAddress).toBe(wallet.address.toLowerCase());
  });

  it('3. Reused nonce is rejected (replay attack prevention)', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'pat.replay@example.com' });
    const agent = await signIn(patient.email);

    const nonceRes = await agent.get('/api/v1/wallet/nonce');
    const { statement } = nonceRes.body.data;

    const wallet = ethers.Wallet.createRandom();
    const signature = await wallet.signMessage(statement);

    // First use: success
    await agent
      .post('/api/v1/wallet/verify')
      .send({ address: wallet.address, message: statement, signature })
      .expect(200);

    // Second use with same nonce: rejected
    const replayRes = await agent
      .post('/api/v1/wallet/verify')
      .send({ address: wallet.address, message: statement, signature });

    expect(replayRes.status).toBe(400);
    expect(replayRes.body.code).toBe('NONCE_ALREADY_USED');
  });

  it('4. Expired nonce is rejected', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'pat.exp@example.com' });
    const agent = await signIn(patient.email);

    const nonceHex = crypto.randomBytes(32).toString('hex');
    const statement = `MediConsent Wallet Verification\n\nNonce: ${nonceHex}`;

    // Create already-expired nonce in database
    await WalletNonce.create({
      userId: patient._id,
      nonce: nonceHex,
      statement,
      expiresAt: new Date(Date.now() - 10000), // in past
    });

    const wallet = ethers.Wallet.createRandom();
    const signature = await wallet.signMessage(statement);

    const res = await agent.post('/api/v1/wallet/verify').send({
      address: wallet.address,
      message: statement,
      signature,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NONCE_EXPIRED');
  });

  it('5. Invalid signature or address mismatch is rejected', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'pat.bad@example.com' });
    const agent = await signIn(patient.email);

    const nonceRes = await agent.get('/api/v1/wallet/nonce');
    const { statement } = nonceRes.body.data;

    const wallet1 = ethers.Wallet.createRandom();
    const wallet2 = ethers.Wallet.createRandom();
    const signatureFromWallet1 = await wallet1.signMessage(statement);

    // Send wallet2 address with wallet1 signature
    const res = await agent.post('/api/v1/wallet/verify').send({
      address: wallet2.address,
      message: statement,
      signature: signatureFromWallet1,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SIGNATURE_ADDRESS_MISMATCH');
  });

  it('6. Wallet already linked to another account is rejected with 409', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const wallet = ethers.Wallet.createRandom();
    await createUser({
      email: 'owner1@example.com',
      walletAddress: wallet.address.toLowerCase(),
    });

    const patient2 = await createUser({ email: 'owner2@example.com' });
    const agent2 = await signIn(patient2.email);

    const nonceRes = await agent2.get('/api/v1/wallet/nonce');
    const { statement } = nonceRes.body.data;
    const signature = await wallet.signMessage(statement);

    const res = await agent2.post('/api/v1/wallet/verify').send({
      address: wallet.address,
      message: statement,
      signature,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WALLET_ALREADY_LINKED');
  });

  it('7. Disconnect wallet succeeds when no active consents depend on it', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const wallet = ethers.Wallet.createRandom();
    const patient = await createUser({
      email: 'pat.disc@example.com',
      walletAddress: wallet.address.toLowerCase(),
    });
    const agent = await signIn(patient.email);

    const statusBefore = await agent.get('/api/v1/wallet/status');
    expect(statusBefore.body.data.connected).toBe(true);

    const discRes = await agent.post('/api/v1/wallet/disconnect').send({});
    expect(discRes.status).toBe(200);
    expect(discRes.body.data.disconnected).toBe(true);

    const updated = await User.findById(patient._id);
    expect(updated.walletAddress).toBeNull();
  });

  it('8. Disconnecting wallet is blocked when active consents depend on it', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patientWallet = ethers.Wallet.createRandom();
    const doctorWallet = ethers.Wallet.createRandom();

    const patient = await createUser({
      email: 'pat.lock@example.com',
      walletAddress: patientWallet.address.toLowerCase(),
    });
    const doctor = await createDoctor({
      email: 'doc.lock@example.com',
      walletAddress: doctorWallet.address.toLowerCase(),
    });

    // Create an active consent
    await Consent.create({
      patientId: patient._id,
      doctorId: doctor._id,
      authorizedRecords: [new mongoose.Types.ObjectId()],
      purpose: 'Emergency surgery',
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400 * 1000), // active in future
      status: 'active',
      blockchainConsentId: '0x123456',
      transactionHash: '0x' + 'a'.repeat(64),
    });

    const agent = await signIn(patient.email);
    const discRes = await agent.post('/api/v1/wallet/disconnect').send({});

    expect(discRes.status).toBe(400);
    expect(discRes.body.code).toBe('ACTIVE_CONSENTS_DEPEND_ON_WALLET');
  });
});

describe('Phase 9 – Patient Consent Grant & Revocation Workflow', () => {
  it('9. prepareConsentGrant returns valid parameters; rejects unapproved requests', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({
      email: 'pat.grant@example.com',
      walletAddress: patWallet.address.toLowerCase(),
    });
    const doctor = await createDoctor({
      email: 'doc.grant@example.com',
      walletAddress: docWallet.address.toLowerCase(),
    });

    // Create a pending request
    const pendingRequest = await AccessRequest.create({
      patientId: patient._id,
      doctorId: doctor._id,
      requestedCategories: ['Prescription'],
      purpose: 'Cardiology follow up',
      requestedDuration: 14,
      status: 'pending',
    });

    const agent = await signIn(patient.email);

    // Attempt to prepare grant on pending request -> 400 REQUEST_NOT_APPROVED
    const failRes = await agent.post('/api/v1/patient/consents/prepare').send({
      requestId: pendingRequest._id,
    });
    expect(failRes.status).toBe(400);
    expect(failRes.body.code).toBe('REQUEST_NOT_APPROVED');

    // Approve the request
    pendingRequest.status = 'approved';
    await pendingRequest.save();

    // Create patient record
    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'Heart ECG Report',
      category: 'Prescription',
      hospitalName: 'General Hospital',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'ecg.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    // Prepare grant with valid approved request
    const prepRes = await agent.post('/api/v1/patient/consents/prepare').send({
      requestId: pendingRequest._id,
      selectedRecordIds: [record._id],
      durationDays: 14,
    });

    expect(prepRes.status).toBe(200);
    expect(prepRes.body.data.consentId).toHaveLength(66);
    expect(prepRes.body.data.doctorWallet.toLowerCase()).toBe(docWallet.address.toLowerCase());
    expect(prepRes.body.data.recordHashes).toHaveLength(1);
    expect(prepRes.body.data.purposeHash).toHaveLength(66);
  });

  it('10. Patient cannot include another patient’s medical records in consent', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet1 = ethers.Wallet.createRandom();
    const patWallet2 = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient1 = await createUser({ email: 'pat1@example.com', walletAddress: patWallet1.address.toLowerCase() });
    const patient2 = await createUser({ email: 'pat2@example.com', walletAddress: patWallet2.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc1@example.com', walletAddress: docWallet.address.toLowerCase() });

    // Record belonging to patient2
    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const recordP2 = await MedicalRecord.create({
      patientId: patient2._id,
      recordTitle: 'Patient 2 Secret Record',
      category: 'Prescription',
      hospitalName: 'Hospital',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'secret.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    const request = await AccessRequest.create({
      patientId: patient1._id,
      doctorId: doctor._id,
      requestedCategories: ['Prescription'],
      purpose: 'Checkup',
      requestedDuration: 7,
      status: 'approved',
    });

    const agent1 = await signIn(patient1.email);
    const res = await agent1.post('/api/v1/patient/consents/prepare').send({
      requestId: request._id,
      selectedRecordIds: [recordP2._id], // belongs to patient2!
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('RECORD_OWNERSHIP_INVALID');
  });

  it('11. synchronizeConsentGrant persists confirmed blockchain consent and reconciles safely', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.sync@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.sync@example.com', walletAddress: docWallet.address.toLowerCase() });

    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'Cardio Echo',
      category: 'Prescription',
      hospitalName: 'Hospital',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'echo.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    const request = await AccessRequest.create({
      patientId: patient._id,
      doctorId: doctor._id,
      requestedCategories: ['Prescription'],
      purpose: 'Cardiology Care',
      requestedDuration: 30,
      status: 'approved',
      requestedRecords: [record._id],
    });

    const fakeConsentId = '0x' + '1'.repeat(64);
    const fakeTxHash = '0x' + '2'.repeat(64);

    // Mock verifyGrantTransaction to return verified receipt details
    vi.spyOn(blockchainService, 'verifyGrantTransaction').mockResolvedValue({
      confirmed: true,
      blockNumber: 42,
      transactionHash: fakeTxHash,
      consentId: fakeConsentId,
      patient: patWallet.address,
      doctor: docWallet.address,
      expiry: Math.floor(Date.now() / 1000) + 86400 * 30,
    });

    const agent = await signIn(patient.email);

    // Synchronize
    const res = await agent.post('/api/v1/patient/consents/grant').send({
      requestId: request._id,
      consentId: fakeConsentId,
      transactionHash: fakeTxHash,
      selectedRecordIds: [record._id],
      durationDays: 30,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.blockchainBacked).toBe(true);
    expect(res.body.data.transactionReference).toBe(fakeTxHash);

    // Idempotency: Re-submitting the same txHash reconciles safely without error
    const dupRes = await agent.post('/api/v1/patient/consents/grant').send({
      requestId: request._id,
      consentId: fakeConsentId,
      transactionHash: fakeTxHash,
      selectedRecordIds: [record._id],
      durationDays: 30,
    });

    expect(dupRes.status).toBe(201);
    expect(dupRes.body.reconciled).toBe(true);
  });

  it('12. Patient can revoke active consent; non-owner cannot revoke', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.rev@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.rev@example.com', walletAddress: docWallet.address.toLowerCase() });
    const stranger = await createUser({ email: 'stranger@example.com' });

    const consent = await Consent.create({
      patientId: patient._id,
      doctorId: doctor._id,
      authorizedRecords: [new mongoose.Types.ObjectId()],
      purpose: 'Consultation',
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400 * 1000),
      status: 'active',
      blockchainConsentId: '0x' + '3'.repeat(64),
      transactionHash: '0x' + '4'.repeat(64),
    });

    const strangerAgent = await signIn(stranger.email);
    // Stranger attempts to revoke -> 404
    await strangerAgent.post(`/api/v1/patient/consents/${consent._id}/revoke`).expect(404);

    // Patient revokes
    vi.spyOn(blockchainService, 'verifyRevokeTransaction').mockResolvedValue({
      confirmed: true,
      blockNumber: 45,
      transactionHash: '0x' + '5'.repeat(64),
      consentId: consent.blockchainConsentId,
    });

    const patientAgent = await signIn(patient.email);
    const revRes = await patientAgent
      .post(`/api/v1/patient/consents/${consent._id}/revoke`)
      .send({ transactionHash: '0x' + '5'.repeat(64) });

    expect(revRes.status).toBe(200);
    expect(revRes.body.data.status).toBe('revoked');

    const updated = await Consent.findById(consent._id);
    expect(updated.status).toBe('revoked');
    expect(updated.revocationTransactionHash).toBe('0x' + '5'.repeat(64));
  });
});

describe('Phase 9 – Live On-Chain Doctor Download Verification', () => {
  it('13. Valid active on-chain consent allows doctor to download and decrypt the medical file', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.dl@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.dl@example.com', walletAddress: docWallet.address.toLowerCase() });

    // Patient uploads document
    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'MRI Brain Scan',
      category: 'MRI / CT Scan Report',
      hospitalName: 'Metropolitan Hospital',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'mri_brain.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    const consentId = '0x' + '6'.repeat(64);

    // Create active consent
    await Consent.create({
      patientId: patient._id,
      doctorId: doctor._id,
      authorizedRecords: [record._id],
      purpose: 'Neurological evaluation',
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400 * 1000), // active
      status: 'active',
      blockchainConsentId: consentId,
      transactionHash: '0x' + '7'.repeat(64),
    });

    // Mock live on-chain check to confirm permission
    vi.spyOn(blockchainService, 'checkLiveOnChainConsent').mockResolvedValue(true);

    const docAgent = await signIn(doctor.email);

    // Doctor downloads record
    const res = await docAgent.get(`/api/v1/doctor/records/${record._id}/download`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.toString()).toBe(SAMPLE_PDF_BUFFER.toString());

    // Verify AccessLog was recorded
    const log = await AccessLog.findOne({
      doctorId: doctor._id,
      medicalRecordId: record._id,
      accessResult: 'granted',
    });
    expect(log).toBeTruthy();
  });

  it('14. Missing consent denies doctor access with 403 CONSENT_REQUIRED', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.nodoc@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.nodoc@example.com', walletAddress: docWallet.address.toLowerCase() });

    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'Blood Test',
      category: 'Laboratory Report',
      hospitalName: 'Lab',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'blood.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    const docAgent = await signIn(doctor.email);
    const res = await docAgent.get(`/api/v1/doctor/records/${record._id}/download`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');

    // Denied access log recorded
    const log = await AccessLog.findOne({
      doctorId: doctor._id,
      medicalRecordId: record._id,
      accessResult: 'denied',
    });
    expect(log).toBeTruthy();
  });

  it('15. Approved request alone without blockchain consent denies doctor download', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.apponly@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.apponly@example.com', walletAddress: docWallet.address.toLowerCase() });

    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'X-Ray Chest',
      category: 'X-ray Report',
      hospitalName: 'Clinic',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'xray.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    // Approved access request in MongoDB, but NO blockchain consent
    await AccessRequest.create({
      patientId: patient._id,
      doctorId: doctor._id,
      requestedCategories: ['X-ray Report'],
      requestedRecords: [record._id],
      purpose: 'Bone check',
      requestedDuration: 7,
      status: 'approved',
    });

    const docAgent = await signIn(doctor.email);
    const res = await docAgent.get(`/api/v1/doctor/records/${record._id}/download`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
  });

  it('16. Unselected record (outside consent scope) denies doctor download', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.scope@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.scope@example.com', walletAddress: docWallet.address.toLowerCase() });

    const stored1 = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record1 = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'Authorized Record',
      category: 'Prescription',
      hospitalName: 'Hospital',
      reportDate: new Date(),
      fileReference: stored1.fileReference,
      originalFileName: 'rec1.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored1.integrityHash,
      encryptionIv: stored1.encryptionIv,
      authTag: stored1.authTag,
    });

    const stored2 = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record2 = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'Unauthorized Record Outside Consent Scope',
      category: 'Prescription',
      hospitalName: 'Hospital',
      reportDate: new Date(),
      fileReference: stored2.fileReference,
      originalFileName: 'rec2.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored2.integrityHash,
      encryptionIv: stored2.encryptionIv,
      authTag: stored2.authTag,
    });

    // Consent authorizes only record1
    await Consent.create({
      patientId: patient._id,
      doctorId: doctor._id,
      authorizedRecords: [record1._id],
      purpose: 'Cardiology Care',
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400 * 1000),
      status: 'active',
      blockchainConsentId: '0x' + '8'.repeat(64),
      transactionHash: '0x' + '9'.repeat(64),
    });

    const docAgent = await signIn(doctor.email);

    // Doctor attempts to download record2 (outside consent)
    const res = await docAgent.get(`/api/v1/doctor/records/${record2._id}/download`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
  });

  it('17. Live smart-contract revocation or expiry denies doctor access (Fail-Closed)', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.revcheck@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.revcheck@example.com', walletAddress: docWallet.address.toLowerCase() });

    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'Clinical Summary',
      category: 'Discharge Summary',
      hospitalName: 'Hospital',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'summary.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    await Consent.create({
      patientId: patient._id,
      doctorId: doctor._id,
      authorizedRecords: [record._id],
      purpose: 'Discharge Followup',
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400 * 1000),
      status: 'active',
      blockchainConsentId: '0x' + 'a'.repeat(64),
      transactionHash: '0x' + 'b'.repeat(64),
    });

    // Mock live smart contract returning false (revoked or expired on-chain)
    vi.spyOn(blockchainService, 'checkLiveOnChainConsent').mockResolvedValue(false);

    const docAgent = await signIn(doctor.email);
    const res = await docAgent.get(`/api/v1/doctor/records/${record._id}/download`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BLOCKCHAIN_CONSENT_DENIED');
  });

  it('18. Blockchain RPC outage fails closed and denies download', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patWallet = ethers.Wallet.createRandom();
    const docWallet = ethers.Wallet.createRandom();

    const patient = await createUser({ email: 'pat.rpc@example.com', walletAddress: patWallet.address.toLowerCase() });
    const doctor = await createDoctor({ email: 'doc.rpc@example.com', walletAddress: docWallet.address.toLowerCase() });

    const stored = await storeEncryptedFile({ buffer: SAMPLE_PDF_BUFFER, scope: 'records' });
    const record = await MedicalRecord.create({
      patientId: patient._id,
      recordTitle: 'Blood Test',
      category: 'Laboratory Report',
      hospitalName: 'Lab',
      reportDate: new Date(),
      fileReference: stored.fileReference,
      originalFileName: 'blood.pdf',
      mimeType: 'application/pdf',
      fileSize: SAMPLE_PDF_BUFFER.length,
      integrityHash: stored.integrityHash,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
    });

    await Consent.create({
      patientId: patient._id,
      doctorId: doctor._id,
      authorizedRecords: [record._id],
      purpose: 'Lab review',
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400 * 1000),
      status: 'active',
      blockchainConsentId: '0x' + 'c'.repeat(64),
      transactionHash: '0x' + 'd'.repeat(64),
    });

    // Mock RPC outage throwing error
    vi.spyOn(blockchainService, 'checkLiveOnChainConsent').mockImplementation(async () => {
      // In blockchain.service.js, any RPC error logs and returns false (fail-closed)
      return false;
    });

    const docAgent = await signIn(doctor.email);
    const res = await docAgent.get(`/api/v1/doctor/records/${record._id}/download`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BLOCKCHAIN_CONSENT_DENIED');
  });
});
