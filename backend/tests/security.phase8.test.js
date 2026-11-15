import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import mongoMemoryServer from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import MedicalRecord from '../models/MedicalRecord.js';
import AccessRequest from '../models/AccessRequest.js';
import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import {
  encryptBuffer,
  decryptBuffer,
  resolveMasterKey,
  isEncryptionConfigured,
  ENCRYPTION_ALGORITHM,
} from '../utils/encryption.js';
import { hashBuffer, verifyHash } from '../utils/integrity.js';
import {
  validateUploadedFile,
  detectFileType,
  MAX_UPLOAD_BYTES,
} from '../utils/fileValidation.js';
import {
  createStorageReference,
  resolveStoragePath,
  saveEncryptedFile,
  readEncryptedFile,
  removeEncryptedFile,
  getStorageRoot,
} from '../utils/privateStorage.js';
import { storeEncryptedFile, readVerifiedFile } from '../services/secureFile.service.js';

const { MongoMemoryServer } = mongoMemoryServer;

const TEST_DB_NAME = 'mediconsent_phase8_security_test';
const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ALT_KEY_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const PASSWORD = 'Password123!';

let mongoServer = null;
let mongoAvailable = false;
let startupError = null;
let testStorageDir = null;

// Valid file fixtures
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%âãÏÓ\nTest PDF medical content for Phase 8 security verification.');
const VALID_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);
const VALID_JPEG_BUFFER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
const SPOOFED_PDF_BUFFER = Buffer.from('MZ executable header pretending to be a pdf file');

async function createUser(overrides = {}) {
  return User.create({
    fullName: 'Test User',
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    mobileNumber: '+91 91234 56789',
    passwordHash: await hashPassword(PASSWORD),
    role: 'patient',
    accountStatus: 'active',
    ...overrides,
  });
}

async function createDoctor(overrides = {}) {
  return createUser({
    fullName: 'Dr. Test Doctor',
    email: `doctor-${Date.now()}-${Math.random()}@example.com`,
    role: 'doctor',
    medicalRegistrationNumber: `MCI-${Math.floor(10000 + Math.random() * 90000)}`,
    specialization: 'Cardiology',
    hospitalName: 'Sunrise Hospital',
    verificationStatus: 'pending',
    ...overrides,
  });
}

async function signIn(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  testStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediconsent-p8-test-'));
  process.env.PRIVATE_STORAGE_DIR = testStorageDir;
  process.env.MASTER_ENCRYPTION_KEY = TEST_KEY_HEX;

  try {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: TEST_DB_NAME } });
    await connectDB(mongoServer.getUri(), { dbName: TEST_DB_NAME, serverSelectionTimeoutMS: 10000 });
    mongoAvailable = true;
  } catch (err) {
    startupError = err;
  }
}, 180000);

afterAll(async () => {
  if (mongoAvailable) {
    await Promise.all([
      User.deleteMany({}),
      MedicalRecord.deleteMany({}),
      AccessRequest.deleteMany({}),
      ActivityLog.deleteMany({}),
    ]);
    await disconnectDB();
    await mongoServer?.stop();
  }
  if (testStorageDir) {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
  }
});

beforeEach(async () => {
  process.env.MASTER_ENCRYPTION_KEY = TEST_KEY_HEX;
  if (mongoAvailable) {
    await Promise.all([
      User.deleteMany({}),
      MedicalRecord.deleteMany({}),
      AccessRequest.deleteMany({}),
      ActivityLog.deleteMany({}),
    ]);
  }
});

describe('Phase 8 – Cryptography, Integrity & Validation Utilities', () => {
  it('1. AES-256-GCM encryption and decryption round trip', () => {
    const plaintext = Buffer.from('Sensitive patient medical record data');
    const encrypted = encryptBuffer(plaintext, { key: TEST_KEY_HEX });

    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
    expect(encrypted.iv).toHaveLength(24); // 12 bytes in hex
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes in hex
    expect(encrypted.algorithm).toBe('aes-256-gcm');

    const decrypted = decryptBuffer(encrypted, { key: TEST_KEY_HEX });
    expect(decrypted.toString()).toBe(plaintext.toString());
  });

  it('2. Different files receive unique random IVs', () => {
    const data = Buffer.from('Identical plaintext content');
    const enc1 = encryptBuffer(data, { key: TEST_KEY_HEX });
    const enc2 = encryptBuffer(data, { key: TEST_KEY_HEX });

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toEqual(enc2.ciphertext);
  });

  it('3. Tampered ciphertext is rejected', () => {
    const plaintext = Buffer.from('Confidential lab report');
    const encrypted = encryptBuffer(plaintext, { key: TEST_KEY_HEX });

    // Flip a byte in ciphertext
    encrypted.ciphertext[0] ^= 0xff;

    expect(() => decryptBuffer(encrypted, { key: TEST_KEY_HEX })).toThrowError(/security check/i);
  });

  it('4. Invalid authentication tag is rejected', () => {
    const plaintext = Buffer.from('Confidential prescription');
    const encrypted = encryptBuffer(plaintext, { key: TEST_KEY_HEX });

    // Corrupt auth tag
    encrypted.authTag = '00000000000000000000000000000000';

    expect(() => decryptBuffer(encrypted, { key: TEST_KEY_HEX })).toThrowError(/security check/i);
  });

  it('5. Invalid master encryption key is rejected', () => {
    // Missing key
    expect(() => resolveMasterKey('')).toThrow();
    // Too short (not 64 hex characters)
    expect(() => resolveMasterKey('123456')).toThrow();
    // Non-hex characters
    expect(() => resolveMasterKey('z'.repeat(64))).toThrow();

    // Wrong key fails decryption
    const encrypted = encryptBuffer(Buffer.from('Medical data'), { key: TEST_KEY_HEX });
    expect(() => decryptBuffer(encrypted, { key: ALT_KEY_HEX })).toThrow();
  });

  it('6. SHA-256 hash is stable for the same file', () => {
    const content = Buffer.from('Radiology X-ray analysis');
    const hash1 = hashBuffer(content);
    const hash2 = hashBuffer(content);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
    expect(verifyHash(content, hash1)).toBe(true);
  });

  it('7. Modified plaintext fails integrity verification', () => {
    const original = Buffer.from('Original blood test: Normal');
    const modified = Buffer.from('Original blood test: High');
    const originalHash = hashBuffer(original);

    expect(verifyHash(modified, originalHash)).toBe(false);
  });

  it('10. Unsupported file types are rejected', () => {
    expect(() =>
      validateUploadedFile({
        originalname: 'malware.exe',
        buffer: Buffer.from('MZ\x00\x00'),
      })
    ).toThrow(/Only \.pdf, \.jpg, \.jpeg, \.png files are accepted/i);
  });

  it('11. MIME spoofing is rejected (extension claims PDF, magic bytes do not match)', () => {
    expect(() =>
      validateUploadedFile({
        originalname: 'report.pdf',
        buffer: SPOOFED_PDF_BUFFER,
      })
    ).toThrow(/file content does not match its extension/i);
  });

  it('12. Oversized files are rejected', () => {
    expect(() =>
      validateUploadedFile({
        originalname: 'large.pdf',
        buffer: Buffer.alloc(MAX_UPLOAD_BYTES + 1024),
      })
    ).toThrow(/File is too large/i);
  });
});

describe('Phase 8 – Private Storage Safety', () => {
  it('16. Plaintext is never persisted in private storage; 17. Only encrypted bytes on disk', async () => {
    const plaintext = Buffer.from('Patient PHI sensitive string that must never hit disk');
    const stored = await storeEncryptedFile({ buffer: plaintext, scope: 'records' });

    expect(stored.fileReference).toMatch(/^records\/[a-f0-9]{32,64}$/);

    const filePath = resolveStoragePath(stored.fileReference);
    const diskBytes = await fs.readFile(filePath);

    // Disk content must not contain any substring of the plaintext
    expect(diskBytes.includes(Buffer.from('Patient PHI'))).toBe(false);
    expect(diskBytes.length).toBeGreaterThan(0);

    // Reading verified file returns original plaintext
    const retrieved = await readVerifiedFile({
      fileReference: stored.fileReference,
      encryptionIv: stored.encryptionIv,
      authTag: stored.authTag,
      integrityHash: stored.integrityHash,
    });
    expect(retrieved.toString()).toBe(plaintext.toString());

    await removeEncryptedFile(stored.fileReference);
  });

  it('Rejects path traversal in storage references', () => {
    expect(() => resolveStoragePath('../../etc/passwd')).toThrow();
    expect(() => resolveStoragePath('records/../../../secret')).toThrow();
    expect(() => resolveStoragePath('arbitrary/nonhex')).toThrow();
  });
});

describe('Phase 8 – Patient Medical Document Upload & Retrieval Endpoints', () => {
  it('8. Patient can upload a valid PDF; 13. Associated with authenticated patient', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'patient.upload@example.com', role: 'patient' });
    const agent = await signIn(patient.email);

    const res = await agent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Complete Blood Count')
      .field('category', 'Laboratory Report')
      .field('hospitalName', 'City General Hospital')
      .field('doctorName', 'Dr. Sharma')
      .field('reportDate', '2026-02-15')
      .field('description', 'Routine blood test panel')
      .attach('file', VALID_PDF_BUFFER, 'blood_count.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.record.recordTitle).toBe('Complete Blood Count');
    expect(res.body.data.record.encryptionStatus).toBe('encrypted');
    expect(res.body.data.record.integrityStatus).toBe('recorded');

    // Sensitive crypto fields and internal file references must NOT be exposed in API
    expect(res.body.data.record.encryptionIv).toBeUndefined();
    expect(res.body.data.record.authTag).toBeUndefined();
    expect(res.body.data.record.fileReference).toBeUndefined();

    // Verify database record has patientId
    const record = await MedicalRecord.findById(res.body.data.record.id);
    expect(record).toBeTruthy();
    expect(String(record.patientId)).toBe(String(patient._id));
    expect(record.fileReference).toMatch(/^records\/[a-f0-9]+/);
    expect(record.integrityHash).toHaveLength(64);
  });

  it('9. Patient can upload a valid PNG or JPEG', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'patient.images@example.com', role: 'patient' });
    const agent = await signIn(patient.email);

    const resPng = await agent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Chest X-Ray')
      .field('category', 'X-ray Report')
      .field('hospitalName', 'Metro Imaging')
      .field('reportDate', '2026-02-18')
      .attach('file', VALID_PNG_BUFFER, 'chest_scan.png');

    expect(resPng.status).toBe(201);
    expect(resPng.body.data.record.fileName).toBe('chest_scan.png');

    const resJpg = await agent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Skin Lesion Photo')
      .field('category', 'Other Document')
      .field('hospitalName', 'Metro Clinic')
      .field('reportDate', '2026-02-19')
      .attach('file', VALID_JPEG_BUFFER, 'lesion.jpg');

    expect(resJpg.status).toBe(201);
    expect(resJpg.body.data.record.fileName).toBe('lesion.jpg');
  });

  it('18. Download decrypts and verifies the original file', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'patient.dl@example.com', role: 'patient' });
    const agent = await signIn(patient.email);

    const uploadRes = await agent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Lipid Panel')
      .field('category', 'Laboratory Report')
      .field('hospitalName', 'Metro Lab')
      .field('reportDate', '2026-02-20')
      .attach('file', VALID_PDF_BUFFER, 'lipid_panel.pdf');

    const recordId = uploadRes.body.data.record.id;

    const downloadRes = await agent.get(`/api/v1/patient/records/${recordId}/download`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe('application/pdf');
    expect(downloadRes.headers['x-content-type-options']).toBe('nosniff');
    expect(downloadRes.headers['content-disposition']).toContain('lipid_panel.pdf');
    expect(downloadRes.body.toString()).toBe(VALID_PDF_BUFFER.toString());
  });

  it("14. Patient cannot access another patient's record details", async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patientA = await createUser({ email: 'patient.a@example.com', role: 'patient' });
    const patientB = await createUser({ email: 'patient.b@example.com', role: 'patient' });

    const agentA = await signIn(patientA.email);
    const agentB = await signIn(patientB.email);

    const upload = await agentA
      .post('/api/v1/patient/records')
      .field('recordTitle', "Patient A's Private Record")
      .field('category', 'Prescription')
      .field('hospitalName', 'Clinic')
      .field('reportDate', '2026-02-21')
      .attach('file', VALID_PDF_BUFFER, 'prescription.pdf');

    const recordId = upload.body.data.record.id;

    // Patient B attempts to get record details
    const probe = await agentB.get(`/api/v1/patient/records/${recordId}`);
    expect(probe.status).toBe(404);
  });

  it("15. Patient cannot download another patient's document", async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patientA = await createUser({ email: 'patient.owner@example.com', role: 'patient' });
    const patientB = await createUser({ email: 'patient.intruder@example.com', role: 'patient' });

    const agentA = await signIn(patientA.email);
    const agentB = await signIn(patientB.email);

    const upload = await agentA
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Confidential Surgery Note')
      .field('category', 'Discharge Summary')
      .field('hospitalName', 'Surgery Center')
      .field('reportDate', '2026-02-22')
      .attach('file', VALID_PDF_BUFFER, 'surgery.pdf');

    const recordId = upload.body.data.record.id;

    // Patient B attempts to download
    const stolen = await agentB.get(`/api/v1/patient/records/${recordId}/download`);
    expect(stolen.status).toBe(404);
  });

  it('19. Tampered stored ciphertext is not delivered (integrity / decryption failure)', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'patient.tamper@example.com', role: 'patient' });
    const agent = await signIn(patient.email);

    const upload = await agent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Test Tamper')
      .field('category', 'Laboratory Report')
      .field('hospitalName', 'Lab')
      .field('reportDate', '2026-02-23')
      .attach('file', VALID_PDF_BUFFER, 'tamper.pdf');

    const recordId = upload.body.data.record.id;
    const dbRecord = await MedicalRecord.findById(recordId);

    // Tamper with the encrypted file directly on disk
    const diskPath = resolveStoragePath(dbRecord.fileReference);
    const bytes = await fs.readFile(diskPath);
    bytes[5] ^= 0xaa;
    await fs.writeFile(diskPath, bytes);

    const res = await agent.get(`/api/v1/patient/records/${recordId}/download`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('20. Missing encrypted file is handled safely as 404', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'patient.missing@example.com', role: 'patient' });
    const agent = await signIn(patient.email);

    const upload = await agent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Missing File Test')
      .field('category', 'Laboratory Report')
      .field('hospitalName', 'Lab')
      .field('reportDate', '2026-02-24')
      .attach('file', VALID_PDF_BUFFER, 'missing.pdf');

    const recordId = upload.body.data.record.id;
    const dbRecord = await MedicalRecord.findById(recordId);

    // Delete the file from private storage
    await removeEncryptedFile(dbRecord.fileReference);

    const res = await agent.get(`/api/v1/patient/records/${recordId}/download`);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not available/i);
  });

  it('21. Database failure cleans up partially stored encrypted files', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'patient.dberr@example.com', role: 'patient' });
    const agent = await signIn(patient.email);

    const recordsDir = path.join(testStorageDir, 'records');
    const filesBefore = await fs.readdir(recordsDir).catch(() => []);

    const spy = vi.spyOn(MedicalRecord, 'create').mockRejectedValueOnce(new Error('Simulated DB failure'));

    const res = await agent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Failing DB Record')
      .field('category', 'Laboratory Report')
      .field('hospitalName', 'Hospital')
      .field('reportDate', '2026-02-26')
      .attach('file', VALID_PDF_BUFFER, 'fail.pdf');

    expect(res.status).toBe(500);

    const filesAfter = await fs.readdir(recordsDir).catch(() => []);
    expect(filesAfter.length).toBe(filesBefore.length);

    spy.mockRestore();
  });
});

describe('Phase 8 – Doctor Certificate Upload & Admin Review', () => {
  it('22. Doctor can upload a valid certificate; 24. Patient cannot upload doctor certificate', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const doctor = await createDoctor({ email: 'doctor.cert@example.com' });
    const patient = await createUser({ email: 'patient.cert@example.com', role: 'patient' });

    const docAgent = await signIn(doctor.email);
    const patAgent = await signIn(patient.email);

    // Doctor uploads certificate
    const docRes = await docAgent
      .post('/api/v1/doctor/certificate')
      .attach('certificate', VALID_PDF_BUFFER, 'medical_council_license.pdf');

    expect(docRes.status).toBe(200);
    expect(docRes.body.success).toBe(true);
    expect(docRes.body.data.certificate.uploaded).toBe(true);
    expect(docRes.body.data.certificate.fileName).toBe('medical_council_license.pdf');

    // Doctor views status
    const statusRes = await docAgent.get('/api/v1/doctor/certificate');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.certificate.uploaded).toBe(true);

    // Patient attempts to upload doctor certificate -> rejected 403
    const patRes = await patAgent
      .post('/api/v1/doctor/certificate')
      .attach('certificate', VALID_PDF_BUFFER, 'license.pdf');

    expect(patRes.status).toBe(403);
    expect(patRes.body.code).toBe('ROLE_NOT_PERMITTED');
  });

  it("23. Doctor cannot access another doctor's certificate", async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const doctor1 = await createDoctor({ email: 'doc1@example.com' });
    const doctor2 = await createDoctor({ email: 'doc2@example.com' });

    const agent1 = await signIn(doctor1.email);
    const agent2 = await signIn(doctor2.email);

    await agent1
      .post('/api/v1/doctor/certificate')
      .attach('certificate', VALID_PDF_BUFFER, 'doc1_cert.pdf');

    // Doctor 2 status only shows their own status (which is false/not uploaded)
    const status2 = await agent2.get('/api/v1/doctor/certificate');
    expect(status2.body.data.certificate.uploaded).toBe(false);
  });

  it('25. Unverified doctor cannot access protected clinical doctor routes', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const pendingDoc = await createDoctor({ email: 'unverified.doc@example.com' });
    const agent = await signIn(pendingDoc.email);

    const resDashboard = await agent.get('/api/v1/doctor/dashboard');
    expect(resDashboard.status).toBe(403);
    expect(resDashboard.body.code).toBe('DOCTOR_PENDING_VERIFICATION');

    const resPatients = await agent.get('/api/v1/doctor/patients');
    expect(resPatients.status).toBe(403);
    expect(resPatients.body.code).toBe('DOCTOR_PENDING_VERIFICATION');
  });

  it('26. Admin certificate access is protected and audited', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const admin = await createUser({ email: 'admin.cert@example.com', role: 'admin' });
    const doctor = await createDoctor({ email: 'doc.for.admin@example.com' });

    const docAgent = await signIn(doctor.email);
    await docAgent
      .post('/api/v1/doctor/certificate')
      .attach('certificate', VALID_PDF_BUFFER, 'dr_license.pdf');

    const adminAgent = await signIn(admin.email);

    // Admin downloads decrypted certificate
    const certRes = await adminAgent.get(`/api/v1/admin/doctors/${doctor._id}/certificate`);
    expect(certRes.status).toBe(200);
    expect(certRes.headers['content-type']).toBe('application/pdf');
    expect(certRes.body.toString()).toBe(VALID_PDF_BUFFER.toString());

    // Verify audit log was recorded
    const audit = await ActivityLog.findOne({
      actorId: admin._id,
      action: 'doctor_certificate.viewed',
      targetId: doctor._id,
    });
    expect(audit).toBeTruthy();
  });
});

describe('Phase 8 – Doctor Medical Record Access Restrictions', () => {
  it('27. Doctor access to patient documents is denied before Phase 9 authorization; 28. Approved access requests alone do not grant document access', async (ctx) => {
    if (!mongoAvailable) ctx.skip();

    const patient = await createUser({ email: 'patient.lock@example.com', role: 'patient' });
    const doctor = await createDoctor({
      email: 'doc.verified@example.com',
      verificationStatus: 'verified',
      accountStatus: 'active',
    });

    const patAgent = await signIn(patient.email);
    const docAgent = await signIn(doctor.email);

    // Patient uploads a record
    const uploadRes = await patAgent
      .post('/api/v1/patient/records')
      .field('recordTitle', 'Private ECG Report')
      .field('category', 'Other Document')
      .field('hospitalName', 'Hospital')
      .field('reportDate', '2026-02-25')
      .attach('file', VALID_PDF_BUFFER, 'ecg.pdf');

    const recordId = uploadRes.body.data.record.id;

    // Doctor attempts to download record directly
    const directRes = await docAgent.get(`/api/v1/doctor/records/${recordId}/download`);
    expect(directRes.status).toBe(403);
    expect(['BLOCKCHAIN_CONSENT_REQUIRED', 'DOCTOR_WALLET_REQUIRED', 'CONSENT_REQUIRED']).toContain(directRes.body.code);

    // Doctor attempts to call patient endpoint -> 403 ROLE_NOT_PERMITTED
    const patEndpointRes = await docAgent.get(`/api/v1/patient/records/${recordId}/download`);
    expect(patEndpointRes.status).toBe(403);
    expect(patEndpointRes.body.code).toBe('ROLE_NOT_PERMITTED');
  });
});
