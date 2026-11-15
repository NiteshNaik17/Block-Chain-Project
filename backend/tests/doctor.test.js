import mongoMemoryServer from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import AccessLog from '../models/AccessLog.js';
import AccessRequest from '../models/AccessRequest.js';
import ActivityLog from '../models/ActivityLog.js';
import Consent from '../models/Consent.js';
import MedicalRecord from '../models/MedicalRecord.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';

const { MongoMemoryServer } = mongoMemoryServer;

/**
 * Phase 6 - doctor portal.
 *
 * Runs against a local in-memory MongoDB instance; no Atlas cluster is
 * contacted. Every privacy and ownership assertion is made against the API
 * surface, so a regression that leaked another doctor's (or a patient's
 * clinical) data would fail the suite.
 */

const TEST_DB_NAME = 'mediconsent_phase6_doctor_test';
const PASSWORD = 'DoctorPass123';

const DAY = 24 * 60 * 60 * 1000;
const TX_HASH = `0x${'a'.repeat(64)}`;

let mongoServer = null;
let mongoAvailable = false;
let startupError = null;

// --- fixtures ----------------------------------------------------------------

async function createUser(overrides = {}) {
  return User.create({
    fullName: 'Test User',
    email: 'user@example.com',
    mobileNumber: '+91 90000 00000',
    passwordHash: await hashPassword(PASSWORD),
    role: 'patient',
    ...overrides,
  });
}

const createPatient = (overrides = {}) =>
  createUser({
    fullName: 'Aarav Sharma',
    email: 'aarav.sharma@example.com',
    mobileNumber: '+91 98200 11223',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    ...overrides,
  });

const createOtherPatient = (overrides = {}) =>
  createPatient({
    fullName: 'Neha Verma',
    email: 'neha.verma@example.com',
    mobileNumber: '+91 98200 44556',
    ...overrides,
  });

const createDoctor = (overrides = {}) =>
  createUser({
    fullName: 'Dr. Rohan Mehta',
    email: 'rohan.mehta@example.com',
    mobileNumber: '+91 98195 77342',
    role: 'doctor',
    accountStatus: 'pending',
    verificationStatus: 'pending',
    medicalRegistrationNumber: 'MCI-2016-44821',
    specialization: 'Cardiology',
    hospitalName: 'Sunrise Multispeciality Hospital',
    ...overrides,
  });

/** An active, administrator-verified doctor. */
const createVerifiedDoctor = (overrides = {}) =>
  createDoctor({ accountStatus: 'active', verificationStatus: 'verified', ...overrides });

const createOtherDoctor = (overrides = {}) =>
  createVerifiedDoctor({
    fullName: 'Dr. Meera Iyer',
    email: 'meera.iyer@example.com',
    mobileNumber: '+91 98195 11223',
    medicalRegistrationNumber: 'MCI-2016-77310',
    specialization: 'Dermatology',
    ...overrides,
  });

const createAdmin = (overrides = {}) =>
  createUser({
    fullName: 'MediConsent Administrator',
    email: 'admin@example.com',
    role: 'admin',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    ...overrides,
  });

let recordCounter = 0;
const createRecord = (patientId, overrides = {}) => {
  recordCounter += 1;
  return MedicalRecord.create({
    patientId,
    recordTitle: `Record ${recordCounter}`,
    category: 'Laboratory Report',
    hospitalName: 'Sunrise Multispeciality Hospital',
    doctorName: 'Dr. Rohan Mehta',
    reportDate: new Date('2026-01-15T00:00:00.000Z'),
    description: 'Routine panel',
    // Storage metadata is required by the model. The API must never return it.
    fileReference: `private/records/patient-${patientId}/report-${recordCounter}.pdf`,
    originalFileName: `report-${recordCounter}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 20480,
    ...overrides,
  });
};

const createRequest = (patientId, doctorId, overrides = {}) =>
  AccessRequest.create({
    patientId,
    doctorId,
    requestedCategories: ['Laboratory Report'],
    purpose: 'Continuity of care review',
    requestedDuration: 30,
    status: 'pending',
    ...overrides,
  });

const createConsent = (patientId, doctorId, authorizedRecords, overrides = {}) => {
  const grantedAt = overrides.grantedAt ?? new Date(Date.now() - DAY);
  return Consent.create({
    patientId,
    doctorId,
    authorizedRecords,
    purpose: 'Post-operative follow-up',
    grantedAt,
    expiresAt: new Date(grantedAt.getTime() + 30 * DAY),
    status: 'active',
    ...overrides,
  });
};

const createAccessLogEntry = (patientId, doctorId, medicalRecordId, overrides = {}) =>
  AccessLog.create({
    patientId,
    doctorId,
    medicalRecordId,
    accessedAt: new Date(),
    accessResult: 'granted',
    reason: 'Consent active',
    ...overrides,
  });

/** An agent already signed in as the given account. */
async function signIn(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** No response may ever leak credential material or a storage reference. */
function expectNoSensitiveFields(response) {
  const payload = JSON.stringify(response.body);
  expect(payload).not.toMatch(/passwordHash/i);
  expect(payload).not.toMatch(/\$2[aby]\$/);
  // Word boundaries so the unrelated `certificateFileReference` field (a doctor
  // certificate reference, always null here) does not false-positive.
  expect(payload).not.toMatch(/\bfileReference\b/i);
  expect(payload).not.toMatch(/\boriginalFileName\b/i);
  expect(payload).not.toMatch(/privateKey|encryptionKey|masterEncryptionKey/i);
  expect(payload).not.toMatch(/private\/records/i);
}

beforeAll(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: TEST_DB_NAME } });
    await connectDB(mongoServer.getUri(), { dbName: TEST_DB_NAME, serverSelectionTimeoutMS: 10000 });
    mongoAvailable = true;
  } catch (err) {
    startupError = err;
    console.warn('[doctor.test] In-memory MongoDB unavailable:', err.message);
  }
}, 180000);

afterAll(async () => {
  if (mongoAvailable) {
    await Promise.all([
      User.deleteMany({}),
      MedicalRecord.deleteMany({}),
      AccessRequest.deleteMany({}),
      Consent.deleteMany({}),
      AccessLog.deleteMany({}),
      ActivityLog.deleteMany({}),
      Notification.deleteMany({}),
    ]);
    await disconnectDB();
  }
  if (mongoServer) await mongoServer.stop();
  vi.restoreAllMocks();
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
  ]);
});

// -----------------------------------------------------------------------------

describe('Phase 6 - doctor dashboard', () => {
  it('returns statistics calculated from the doctor\'s own data', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);

    await createRequest(patient._id, doctor._id, { status: 'pending' });
    await createRequest(patient._id, doctor._id, { status: 'approved', patientResponseDate: new Date() });
    await createRequest(patient._id, doctor._id, { status: 'rejected', patientResponseDate: new Date() });

    // An active consent without an on-chain anchor: not counted as accessible.
    await createConsent(patient._id, doctor._id, [record._id]);

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalRequests).toBe(3);
    expect(res.body.data.stats.pendingRequests).toBe(1);
    expect(res.body.data.stats.approvedRequests).toBe(1);
    expect(res.body.data.stats.rejectedRequests).toBe(1);
    // An application-level consent is NOT blockchain-backed, so it is not
    // counted as accessible.
    expect(res.body.data.stats.accessibleRecords).toBe(0);
    expect(res.body.data.stats.activeConsentRecords).toBe(1);
    expect(res.body.data.recentRequests).toHaveLength(3);
    expect(Array.isArray(res.body.data.recentActivity)).toBe(true);
    expect(res.body.data.requestTrend).toHaveLength(6);
    expectNoSensitiveFields(res);
  });

  it('counts accessible records only when a genuine on-chain consent exists', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);

    await createConsent(patient._id, doctor._id, [record._id], { transactionHash: TX_HASH });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.accessibleRecords).toBe(1);
    expect(res.body.data.stats.blockchainBackedRecords).toBe(1);
  });

  it('returns zeroed statistics and empty arrays when the doctor has no data', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.stats).toMatchObject({
      totalRequests: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
      accessibleRecords: 0,
      activeConsents: 0,
    });
    expect(res.body.data.recentRequests).toEqual([]);
    // Signing in records an activity entry, so only request/access collections
    // are guaranteed empty here.
    expect(res.body.data.recentAccessHistory).toEqual([]);
  });

  it('never counts another doctor\'s data', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const other = await createOtherDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);

    // All activity belongs to the OTHER doctor.
    await createRequest(patient._id, other._id, { status: 'approved' });
    await createConsent(patient._id, other._id, [record._id], { transactionHash: TX_HASH });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalRequests).toBe(0);
    expect(res.body.data.stats.accessibleRecords).toBe(0);
    expect(res.body.data.recentRequests).toEqual([]);
  });
});

describe('Phase 6 - patient directory', () => {
  it('returns only the minimum permitted identifying information', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    await createPatient({
      dateOfBirth: new Date('1994-03-22T00:00:00.000Z'),
      address: '12 Marine Drive, Mumbai',
      emergencyContact: 'Priya Sharma · +91 98200 11111',
      bloodGroup: 'O+',
    });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/patients');

    expect(res.status).toBe(200);
    expect(res.body.data.patients).toHaveLength(1);

    const patient = res.body.data.patients[0];
    expect(patient.fullName).toBe('Aarav Sharma');
    expect(patient.email).toBe('aarav.sharma@example.com');
    expect(patient.id).toBeTruthy();
    expect(patient.ageBand).toBeTruthy();

    // Unnecessary private information must never be exposed.
    expect(patient.address).toBeUndefined();
    expect(patient.emergencyContact).toBeUndefined();
    expect(patient.dateOfBirth).toBeUndefined();
    expect(patient.bloodGroup).toBeUndefined();
    expect(patient.passwordHash).toBeUndefined();
    expect(patient.walletAddress).toBeUndefined();
    expectNoSensitiveFields(res);
  });

  it('never exposes medical records, documents or doctors through the directory', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const patient = await createPatient();
    await createRecord(patient._id, { recordTitle: 'Chest X-Ray Report', category: 'X-ray Report' });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/patients');

    expect(res.status).toBe(200);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toMatch(/Chest X-Ray Report/);
    expect(payload).not.toMatch(/records/i);
    expectNoSensitiveFields(res);
  });

  it('supports search and pagination', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    for (let index = 0; index < 5; index += 1) {
      await createUser({
        fullName: `Directory Patient ${index}`,
        email: `directory.patient.${index}@example.com`,
        mobileNumber: `+91 98200 1000${index}`,
        role: 'patient',
        accountStatus: 'active',
        verificationStatus: 'not_applicable',
      });
    }
    await createPatient({ fullName: 'Zoya Khan', email: 'zoya.khan@example.com' });

    const agent = await signIn('rohan.mehta@example.com');

    const firstPage = await agent.get('/api/v1/doctor/patients?page=1&limit=2');
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.patients).toHaveLength(2);
    expect(firstPage.body.data.pagination.total).toBe(6);
    expect(firstPage.body.data.pagination.totalPages).toBe(3);

    const search = await agent.get('/api/v1/doctor/patients?search=Zoya');
    expect(search.status).toBe(200);
    expect(search.body.data.patients).toHaveLength(1);
    expect(search.body.data.patients[0].fullName).toBe('Zoya Khan');

    const emailSearch = await agent.get('/api/v1/doctor/patients?search=zoya.khan@example.com');
    expect(emailSearch.body.data.patients).toHaveLength(1);
  });

  it('does not return doctors or administrators in the patient directory', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    await createAdmin();
    await createPatient();

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/patients');

    expect(res.status).toBe(200);
    expect(res.body.data.patients).toHaveLength(1);
    expect(res.body.data.patients[0].fullName).toBe('Aarav Sharma');
  });
});

describe('Phase 6 - submit an access request', () => {
  it('submits a valid category-first request without exposing any record', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    await createRecord(patient._id);

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.post('/api/v1/doctor/requests').send({
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report', 'Prescription'],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.request.status).toBe('pending');
    expect(res.body.data.request.requestedCategories).toEqual(['Laboratory Report', 'Prescription']);
    // No records are selected by the doctor - the patient chooses them.
    expect(res.body.data.request.selectedRecords).toEqual([]);
    expect(res.body.data.request.blockchainBacked).toBe(false);
    expect(res.body.data.request.grantedOnChain).toBe(false);
    expectNoSensitiveFields(res);

    const stored = await AccessRequest.findOne({ doctorId: doctor._id, patientId: patient._id });
    expect(stored).toBeTruthy();
    expect(stored.requestedRecords).toHaveLength(0);
    expect(stored.requestedCategories).toEqual(['Laboratory Report', 'Prescription']);

    // CRITICAL: submitting a request must NOT create a consent.
    expect(await Consent.countDocuments({ doctorId: doctor._id })).toBe(0);

    // An audit entry is recorded for the submission.
    const activity = await ActivityLog.findOne({ action: 'access_request.submitted' });
    expect(activity).toBeTruthy();
    expect(String(activity.actorId)).toBe(String(doctor._id));
  });

  it('creates a notification for the patient', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const patient = await createPatient();

    const agent = await signIn('rohan.mehta@example.com');
    await agent.post('/api/v1/doctor/requests').send({
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });

    const notification = await Notification.findOne({ recipientId: patient._id });
    expect(notification).toBeTruthy();
    expect(notification.notificationType).toBe('consent_request');
  });

  it('rejects an invalid patient id', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');
    const body = {
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    };

    const malformed = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...body, patientId: 'not-a-valid-id' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('INVALID_PATIENT_ID');

    const unknown = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...body, patientId: '64b7f0c8f1a2b3c4d5e6f7a8' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('PATIENT_NOT_FOUND');
  });

  it('rejects a non-patient target id', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const other = await createOtherDoctor();

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.post('/api/v1/doctor/requests').send({
      patientId: String(other._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PATIENT_NOT_FOUND');
  });

  it('always scopes the request to the authenticated doctor', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const other = await createOtherDoctor();
    const patient = await createPatient();

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.post('/api/v1/doctor/requests').send({
      // A client-supplied doctor id must be ignored.
      doctorId: String(other._id),
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });

    expect(res.status).toBe(201);
    const stored = await AccessRequest.findOne({ patientId: patient._id });
    expect(String(stored.doctorId)).toBe(String(doctor._id));
    expect(String(stored.doctorId)).not.toBe(String(other._id));
  });

  it('rejects invalid categories, purposes and durations', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const patient = await createPatient();
    const agent = await signIn('rohan.mehta@example.com');
    const base = {
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    };

    const badCategory = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...base, categories: ['Secret Diary'] });
    expect(badCategory.status).toBe(400);

    const noCategories = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...base, categories: [] });
    expect(noCategories.status).toBe(400);

    const shortPurpose = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...base, purpose: 'short' });
    expect(shortPurpose.status).toBe(400);

    const tooLongPurpose = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...base, purpose: 'a'.repeat(601) });
    expect(tooLongPurpose.status).toBe(400);

    const zeroDuration = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...base, requestedDuration: 0 });
    expect(zeroDuration.status).toBe(400);

    const excessiveDuration = await agent
      .post('/api/v1/doctor/requests')
      .send({ ...base, requestedDuration: 400 });
    expect(excessiveDuration.status).toBe(400);

    expect(await AccessRequest.countDocuments({})).toBe(0);
  });

  it('handles a duplicate pending request for the same patient', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const patient = await createPatient();
    const agent = await signIn('rohan.mehta@example.com');
    const body = {
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    };

    const first = await agent.post('/api/v1/doctor/requests').send(body);
    expect(first.status).toBe(201);

    const second = await agent.post('/api/v1/doctor/requests').send(body);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_PENDING_REQUEST');

    expect(await AccessRequest.countDocuments({ patientId: patient._id })).toBe(1);
  });
});

describe('Phase 6 - my requests', () => {
  it('lists only the authenticated doctor\'s own requests', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const other = await createOtherDoctor();
    const patient = await createPatient();
    const otherPatient = await createOtherPatient();

    await createRequest(patient._id, doctor._id, { status: 'pending' });
    await createRequest(otherPatient._id, other._id, { status: 'pending' });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/requests');

    expect(res.status).toBe(200);
    expect(res.body.data.requests).toHaveLength(1);
    expect(res.body.data.requests[0].patient.fullName).toBe('Aarav Sharma');
    // Never the other doctor's patient.
    expect(JSON.stringify(res.body)).not.toMatch(/Neha Verma/);
    expect(res.body.data.counts.total).toBe(1);
  });

  it('supports status filtering, search and newest-first pagination', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const aarav = await createPatient();
    const neha = await createOtherPatient();

    await createRequest(aarav._id, doctor._id, { status: 'pending' });
    await createRequest(neha._id, doctor._id, { status: 'approved', patientResponseDate: new Date() });

    const agent = await signIn('rohan.mehta@example.com');

    const pending = await agent.get('/api/v1/doctor/requests?status=pending');
    expect(pending.status).toBe(200);
    expect(pending.body.data.requests).toHaveLength(1);
    expect(pending.body.data.requests[0].status).toBe('pending');

    const search = await agent.get('/api/v1/doctor/requests?search=Neha');
    expect(search.body.data.requests).toHaveLength(1);
    expect(search.body.data.requests[0].patient.fullName).toBe('Neha Verma');

    const paged = await agent.get('/api/v1/doctor/requests?page=1&limit=1');
    expect(paged.body.data.requests).toHaveLength(1);
    expect(paged.body.data.pagination.total).toBe(2);

    const badFilter = await agent.get('/api/v1/doctor/requests?status=bogus');
    expect(badFilter.status).toBe(400);
  });

  it('shows the patient\'s selected records as a safe summary without file references', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id, { recordTitle: 'Lipid Profile' });

    await createRequest(patient._id, doctor._id, {
      status: 'approved',
      requestedRecords: [record._id],
      patientResponseDate: new Date(),
    });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/requests');

    expect(res.status).toBe(200);
    const request = res.body.data.requests[0];
    expect(request.selectedRecordCount).toBe(1);
    expect(request.selectedRecords[0].recordTitle).toBe('Lipid Profile');
    // An approval is a recorded decision, never a blockchain authorization.
    expect(request.authorizationType).toBe('recorded_decision');
    expect(request.blockchainBacked).toBe(false);
    expectNoSensitiveFields(res);
  });

  it('does not let a doctor modify or approve their own request', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const request = await createRequest(patient._id, doctor._id);

    const agent = await signIn('rohan.mehta@example.com');

    // There is no doctor-side mutation route for a request.
    for (const [method, path] of [
      ['patch', `/api/v1/doctor/requests/${request._id}/approve`],
      ['patch', `/api/v1/doctor/requests/${request._id}`],
      ['delete', `/api/v1/doctor/requests/${request._id}`],
      ['post', `/api/v1/doctor/requests/${request._id}/cancel`],
    ]) {
      const res = await agent[method](path).send({ status: 'approved' });
      expect(res.status, `${method} ${path}`).toBe(404);
    }

    const stored = await AccessRequest.findById(request._id);
    expect(stored.status).toBe('pending');
  });
});

describe('Phase 6 - accessible records (security critical)', () => {
  it('does not grant access from an approved request alone', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);

    // An approved request that names the record - but NO consent exists.
    await createRequest(patient._id, doctor._id, {
      status: 'approved',
      requestedRecords: [record._id],
      patientResponseDate: new Date(),
    });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/accessible-records');

    expect(res.status).toBe(200);
    expect(res.body.data.records).toEqual([]);
    expect(res.body.data.secureAccessAvailable).toBe(false);
    expect(res.body.data.blockchainPhaseReady).toBe(false);
  });

  it('does not treat an application-level consent without an on-chain anchor as access', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);

    await createConsent(patient._id, doctor._id, [record._id]);

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/accessible-records');

    expect(res.status).toBe(200);
    expect(res.body.data.records).toEqual([]);
  });

  it('returns a record only with an active, unexpired, on-chain consent', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id, { recordTitle: 'MRI Brain Report' });

    await createConsent(patient._id, doctor._id, [record._id], { transactionHash: TX_HASH });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/accessible-records');

    expect(res.status).toBe(200);
    expect(res.body.data.records).toHaveLength(1);
    expect(res.body.data.records[0].recordTitle).toBe('MRI Brain Report');
    expect(res.body.data.records[0].blockchainBacked).toBe(true);
    expect(res.body.data.secureAccessAvailable).toBe(true);
    expectNoSensitiveFields(res);
  });

  it('excludes expired, revoked and other doctors\' consents', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const other = await createOtherDoctor();
    const patient = await createPatient();
    const activeRecord = await createRecord(patient._id, { recordTitle: 'Active Record' });
    const expiredRecord = await createRecord(patient._id, { recordTitle: 'Expired Record' });
    const revokedRecord = await createRecord(patient._id, { recordTitle: 'Revoked Record' });
    const otherRecord = await createRecord(patient._id, { recordTitle: 'Other Doctor Record' });

    await createConsent(patient._id, doctor._id, [activeRecord._id], { transactionHash: TX_HASH });
    await createConsent(patient._id, doctor._id, [expiredRecord._id], {
      transactionHash: TX_HASH,
      grantedAt: new Date(Date.now() - 90 * DAY),
      expiresAt: new Date(Date.now() - 40 * DAY),
    });
    await createConsent(patient._id, doctor._id, [revokedRecord._id], {
      transactionHash: TX_HASH,
      status: 'revoked',
    });
    await createConsent(patient._id, other._id, [otherRecord._id], { transactionHash: TX_HASH });

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/accessible-records');

    expect(res.status).toBe(200);
    expect(res.body.data.records).toHaveLength(1);
    expect(res.body.data.records[0].recordTitle).toBe('Active Record');
  });
});

describe('Phase 6 - access history', () => {
  it('returns only the authenticated doctor\'s access log entries', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const other = await createOtherDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);

    await createAccessLogEntry(patient._id, doctor._id, record._id, {
      accessResult: 'granted',
      reason: 'Consent active',
    });
    await createAccessLogEntry(patient._id, doctor._id, record._id, {
      accessResult: 'denied',
      reason: 'Consent expired',
    });
    await createAccessLogEntry(patient._id, other._id, record._id);

    const agent = await signIn('rohan.mehta@example.com');
    const res = await agent.get('/api/v1/doctor/access-history');

    expect(res.status).toBe(200);
    expect(res.body.data.entries).toHaveLength(2);
    expect(res.body.data.counts).toMatchObject({ total: 2, granted: 1, denied: 1 });
    expect(res.body.data.entries[0].patient.fullName).toBe('Aarav Sharma');
    expectNoSensitiveFields(res);
  });

  it('returns an empty history and supports result filtering', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');

    const empty = await agent.get('/api/v1/doctor/access-history');
    expect(empty.status).toBe(200);
    expect(empty.body.data.entries).toEqual([]);
    expect(empty.body.data.counts).toMatchObject({ total: 0, granted: 0, denied: 0 });

    const badFilter = await agent.get('/api/v1/doctor/access-history?result=bogus');
    expect(badFilter.status).toBe(400);
  });

  it('does not expose a route for a doctor to write access logs', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');

    for (const path of ['/api/v1/doctor/access-logs', '/api/v1/doctor/activity-logs', '/api/v1/doctor/logs']) {
      const res = await agent.post(path).send({ accessResult: 'granted' });
      expect(res.status).toBe(404);
    }

    expect(await AccessLog.countDocuments({})).toBe(0);
  });
});

describe('Phase 6 - doctor profile', () => {
  it('returns the profile and updates only the permitted fields', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');

    const before = await agent.get('/api/v1/doctor/profile');
    expect(before.status).toBe(200);
    expect(before.body.user.email).toBe('rohan.mehta@example.com');
    expect(before.body.user.verificationStatus).toBe('verified');
    expect(before.body.user.medicalRegistrationNumber).toBe('MCI-2016-44821');
    expect(before.body.user.passwordHash).toBeUndefined();
    expectNoSensitiveFields(before);

    const res = await agent.patch('/api/v1/doctor/profile').send({
      fullName: 'Dr. Rohan A. Mehta',
      mobileNumber: '+91 98195 99887',
      specialization: 'Interventional Cardiology',
      hospitalName: 'Coastal Heart Institute',
      profilePhoto: 'https://cdn.example.com/avatars/rohan.png',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Dr. Rohan A. Mehta');
    expect(res.body.user.specialization).toBe('Interventional Cardiology');
    expect(res.body.user.hospitalName).toBe('Coastal Heart Institute');
    // Read-only fields are unchanged.
    expect(res.body.user.email).toBe('rohan.mehta@example.com');
    expect(res.body.user.medicalRegistrationNumber).toBe('MCI-2016-44821');
    expect(res.body.user.verificationStatus).toBe('verified');

    const stored = await User.findById(doctor._id);
    expect(stored.fullName).toBe('Dr. Rohan A. Mehta');
    expect(stored.verificationStatus).toBe('verified');

    const activity = await ActivityLog.findOne({ action: 'doctor.profile_updated' });
    expect(activity).toBeTruthy();
    expect(activity.metadata.fields).toContain('fullName');
    // No values are written into the audit trail.
    expect(JSON.stringify(activity.metadata)).not.toMatch(/Rohan A\. Mehta/);
  });

  it('refuses to change role, verification status or other protected fields', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');

    const attempts = [
      { email: 'attacker@example.com' },
      { role: 'admin' },
      { accountStatus: 'suspended' },
      { verificationStatus: 'pending' },
      { medicalRegistrationNumber: 'MCI-9999-00000' },
      { walletAddress: '0x0000000000000000000000000000000000000000' },
      { passwordHash: '$2a$12$abcdefghijklmnopqrstuv' },
    ];

    for (const payload of attempts) {
      const res = await agent.patch('/api/v1/doctor/profile').send(payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
      expect(res.body.code).toBe('PROTECTED_FIELD');
    }

    const stored = await User.findById(doctor._id).select('+passwordHash');
    expect(stored.role).toBe('doctor');
    expect(stored.accountStatus).toBe('active');
    expect(stored.verificationStatus).toBe('verified');
    expect(stored.email).toBe('rohan.mehta@example.com');
    expect(stored.walletAddress).toBeNull();
    expect(stored.passwordHash).toBe(doctor.passwordHash);
  });

  it('rejects arbitrary local file paths for the profile photo', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');

    const res = await agent
      .patch('/api/v1/doctor/profile')
      .send({ profilePhoto: 'C:\\Users\\HP\\certificates\\secret.png' });

    expect(res.status).toBe(400);
  });
});

describe('Phase 6 - notifications', () => {
  it('surfaces the doctor notification created by a patient decision', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);

    // The doctor submits a category-first request.
    const doctorAgent = await signIn('rohan.mehta@example.com');
    const submitted = await doctorAgent.post('/api/v1/doctor/requests').send({
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });
    expect(submitted.status).toBe(201);

    // The patient approves, choosing their own record.
    const patientAgent = await signIn('aarav.sharma@example.com');
    const approved = await patientAgent
      .patch(`/api/v1/patient/requests/${submitted.body.data.request.id}/approve`)
      .send({ recordIds: [String(record._id)] });
    expect(approved.status).toBe(200);

    const notifications = await doctorAgent.get('/api/v1/doctor/notifications');
    expect(notifications.status).toBe(200);
    const types = notifications.body.data.notifications.map((item) => item.notificationType);
    expect(types).toContain('consent_approved');
  });
});

describe('Phase 6 - patient approval compatibility', () => {
  it('lets the patient see categories, select their own records and approve', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id, { recordTitle: 'Lipid Profile' });

    const doctorAgent = await signIn('rohan.mehta@example.com');
    const submitted = await doctorAgent.post('/api/v1/doctor/requests').send({
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });
    const requestId = submitted.body.data.request.id;

    const patientAgent = await signIn('aarav.sharma@example.com');
    const list = await patientAgent.get('/api/v1/patient/requests');
    expect(list.status).toBe(200);
    const visible = list.body.data.requests.find((item) => item.id === requestId);
    expect(visible.requestedCategories).toEqual(['Laboratory Report']);
    expect(visible.requiresRecordSelection).toBe(true);
    expect(visible.requestedRecords).toEqual([]);

    const approved = await patientAgent
      .patch(`/api/v1/patient/requests/${requestId}/approve`)
      .send({ recordIds: [String(record._id)] });

    expect(approved.status).toBe(200);
    expect(approved.body.data.request.status).toBe('approved');
    expect(approved.body.data.consentCreated).toBe(false);
    expect(approved.body.data.blockchainBacked).toBe(false);
    expect(JSON.stringify(approved.body)).not.toMatch(/transactionHash|0x[a-fA-F0-9]{64}/);

    const stored = await AccessRequest.findById(requestId);
    expect(stored.status).toBe('approved');
    expect(stored.requestedRecords.map(String)).toEqual([String(record._id)]);
    expect(stored.patientResponseDate).toBeTruthy();

    // No blockchain-backed consent is created in this phase.
    expect(await Consent.countDocuments({ patientId: patient._id })).toBe(0);

    // The doctor sees the patient's selected record via the request list.
    const doctorRequests = await doctorAgent.get('/api/v1/doctor/requests');
    const seen = doctorRequests.body.data.requests.find((item) => item.id === requestId);
    expect(seen.selectedRecordCount).toBe(1);
    expect(seen.selectedRecords[0].recordTitle).toBe('Lipid Profile');
  });

  it('requires the patient to select records before approving a category-first request', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const patient = await createPatient();

    const doctorAgent = await signIn('rohan.mehta@example.com');
    const submitted = await doctorAgent.post('/api/v1/doctor/requests').send({
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });
    const requestId = submitted.body.data.request.id;

    const patientAgent = await signIn('aarav.sharma@example.com');
    const res = await patientAgent.patch(`/api/v1/patient/requests/${requestId}/approve`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECORDS_REQUIRED_FOR_APPROVAL');

    const stored = await AccessRequest.findById(requestId);
    expect(stored.status).toBe('pending');
  });

  it('rejects a patient selecting another patient\'s record', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const patient = await createPatient();
    const other = await createOtherPatient();
    const foreignRecord = await createRecord(other._id);

    const doctorAgent = await signIn('rohan.mehta@example.com');
    const submitted = await doctorAgent.post('/api/v1/doctor/requests').send({
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });
    const requestId = submitted.body.data.request.id;

    const patientAgent = await signIn('aarav.sharma@example.com');
    const res = await patientAgent
      .patch(`/api/v1/patient/requests/${requestId}/approve`)
      .send({ recordIds: [String(foreignRecord._id)] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUEST_RECORD_MISMATCH');

    const stored = await AccessRequest.findById(requestId);
    expect(stored.status).toBe('pending');
  });

  it('lets a patient reject a category-first request without selecting records', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const patient = await createPatient();

    const doctorAgent = await signIn('rohan.mehta@example.com');
    const submitted = await doctorAgent.post('/api/v1/doctor/requests').send({
      patientId: String(patient._id),
      purpose: 'Reviewing recent laboratory results for follow-up care',
      requestedDuration: 30,
      categories: ['Laboratory Report'],
    });
    const requestId = submitted.body.data.request.id;

    const patientAgent = await signIn('aarav.sharma@example.com');
    const res = await patientAgent
      .patch(`/api/v1/patient/requests/${requestId}/reject`)
      .send({ reason: 'I prefer to share these records in person' });

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('rejected');

    const stored = await AccessRequest.findById(requestId);
    expect(stored.status).toBe('rejected');
    expect(stored.patientResponseDate).toBeTruthy();
    expect(await Consent.countDocuments({ patientId: patient._id })).toBe(0);
  });
});

describe('Phase 6 - doctor API security boundaries', () => {
  it('rejects unauthenticated requests with 401', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const paths = [
      '/api/v1/doctor/dashboard',
      '/api/v1/doctor/patients',
      '/api/v1/doctor/requests',
      '/api/v1/doctor/accessible-records',
      '/api/v1/doctor/access-history',
      '/api/v1/doctor/profile',
      '/api/v1/doctor/notifications',
    ];

    for (const path of paths) {
      const res = await request(app).get(path);
      expect(res.status, `${path} should require authentication`).toBe(401);
    }

    const submit = await request(app).post('/api/v1/doctor/requests').send({});
    expect(submit.status).toBe(401);
  });

  it('blocks pending, rejected and suspended doctors from every doctor API', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    // A doctor who never passed verification, plus two who were verified but
    // have since been suspended / rejected. The latter are signed in while still
    // verified, then the database row is changed, proving the guard re-checks
    // the live account status on every request.
    const pending = await createDoctor({
      email: 'pending@example.com',
      accountStatus: 'pending',
      verificationStatus: 'pending',
    });
    const suspended = await createVerifiedDoctor({
      email: 'suspended@example.com',
      medicalRegistrationNumber: 'MCI-2016-22222',
    });
    const rejected = await createVerifiedDoctor({
      email: 'rejected@example.com',
      medicalRegistrationNumber: 'MCI-2016-11111',
    });

    const pendingAgent = await signIn('pending@example.com');
    const suspendedAgent = await signIn('suspended@example.com');
    const rejectedAgent = await signIn('rejected@example.com');

    await User.updateOne({ _id: pending._id }, { $set: { verificationStatus: 'pending' } });
    await User.updateOne({ _id: suspended._id }, { $set: { accountStatus: 'suspended' } });
    await User.updateOne(
      { _id: rejected._id },
      { $set: { accountStatus: 'rejected', verificationStatus: 'rejected' } }
    );

    const cases = [
      ['pending', pendingAgent],
      ['suspended', suspendedAgent],
      ['rejected', rejectedAgent],
    ];

    for (const [label, agent] of cases) {
      for (const path of ['/api/v1/doctor/dashboard', '/api/v1/doctor/patients', '/api/v1/doctor/requests']) {
        const res = await agent.get(path);
        expect(res.status, `${label} -> ${path}`).toBe(403);
        expect(res.body.code).toBe('DOCTOR_PENDING_VERIFICATION');
      }

      const submit = await agent.post('/api/v1/doctor/requests').send({
        patientId: '64b7f0c8f1a2b3c4d5e6f7a8',
        purpose: 'Reviewing recent laboratory results for follow-up care',
        requestedDuration: 30,
        categories: ['Laboratory Report'],
      });
      expect(submit.status, `${label} -> submit`).toBe(403);
    }
  });

  it('blocks patient and admin sessions on doctor-only endpoints', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    await createAdmin();

    const paths = [
      '/api/v1/doctor/dashboard',
      '/api/v1/doctor/patients',
      '/api/v1/doctor/requests',
      '/api/v1/doctor/accessible-records',
      '/api/v1/doctor/access-history',
      '/api/v1/doctor/profile',
      '/api/v1/doctor/notifications',
    ];

    for (const email of ['aarav.sharma@example.com', 'admin@example.com']) {
      const agent = await signIn(email);
      for (const path of paths) {
        const res = await agent.get(path);
        expect(res.status, `${email} -> ${path}`).toBe(403);
      }

      const patchProfile = await agent.patch('/api/v1/doctor/profile').send({ fullName: 'Renamed' });
      expect(patchProfile.status).toBe(403);
    }
  });

  it('still grants the verified-doctor role-guard probe (Phase 4/5 regression)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const agent = await signIn('rohan.mehta@example.com');

    const res = await agent.get('/api/v1/doctor/access');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('doctor');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('does not expose any medical-file upload, download or preview route for doctors', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createVerifiedDoctor();
    const patient = await createPatient();
    const record = await createRecord(patient._id);
    const agent = await signIn('rohan.mehta@example.com');

    const attempts = [
      ['get', `/api/v1/doctor/records/${record._id}/download`],
      ['get', `/api/v1/doctor/records/${record._id}/file`],
      ['get', `/api/v1/doctor/records/${record._id}/preview`],
      ['get', '/api/v1/doctor/files'],
      ['post', '/api/v1/doctor/records'],
      ['post', '/api/v1/doctor/records/upload'],
      ['post', '/api/v1/doctor/consents'],
    ];

    for (const [method, path] of attempts) {
      const res = await agent[method](path).send({});
      // In Phase 6 endpoints didn't exist (404); in Phase 8 preparatory download explicitly denies access (403 BLOCKCHAIN_CONSENT_REQUIRED)
      expect([403, 404], `${method.toUpperCase()} ${path} must not be accessible`).toContain(res.status);
    }

    // The stored document stays private and unreachable through the doctor API.
    const stored = await MedicalRecord.findById(record._id);
    expect(stored.fileReference).toContain('private/records');
    expect(await Consent.countDocuments({ doctorId: doctor._id })).toBe(0);
  });
});
