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
 * Phase 5 - patient portal.
 *
 * Uses a local in-memory MongoDB instance; no Atlas cluster is contacted.
 * Every assertion about ownership isolation is made against the API surface, so
 * a regression that leaked another patient's data would fail the suite.
 */

const TEST_DB_NAME = 'mediconsent_phase5_patient_test';
const PASSWORD = 'PatientPass123';

const DAY = 24 * 60 * 60 * 1000;

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

const createRequest = (patientId, doctorId, requestedRecords, overrides = {}) =>
  AccessRequest.create({
    patientId,
    doctorId,
    requestedRecords,
    purpose: 'Continuity of care review',
    requestedDuration: 30,
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

const createNotification = (recipientId, overrides = {}) =>
  Notification.create({
    recipientId,
    title: 'New access request',
    message: 'A doctor requested access to your records.',
    notificationType: 'consent_request',
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
  // certificate reference, always null for a patient) does not false-positive.
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
    console.warn('[patient.test] In-memory MongoDB unavailable:', err.message);
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

describe('Phase 5 - patient dashboard', () => {
  it('returns statistics calculated from the patient\'s own data', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    await createDoctor();

    await createRecord(patient._id, { category: 'Laboratory Report' });
    await createRecord(patient._id, { category: 'Prescription' });
    await createRecord(patient._id, { category: 'Prescription' });
    await createRecord(patient._id, { recordStatus: 'archived' });
    await createRecord(patient._id, { recordStatus: 'deleted' });

    const doctor = await User.findOne({ role: 'doctor' });
    const records = await MedicalRecord.find({ patientId: patient._id, recordStatus: 'active' });

    await createRequest(patient._id, doctor._id, [records[0]._id]);
    await createRequest(patient._id, doctor._id, [records[1]._id]);
    await createRequest(patient._id, doctor._id, [records[2]._id], { status: 'approved' });

    await createConsent(patient._id, doctor._id, [records[0]._id], {
      expiresAt: new Date(Date.now() + 10 * DAY),
    });
    await createConsent(patient._id, doctor._id, [records[1]._id], {
      expiresAt: new Date(Date.now() + 200 * DAY),
    });
    await createConsent(patient._id, doctor._id, [records[2]._id], {
      grantedAt: new Date(Date.now() - 60 * DAY),
      expiresAt: new Date(Date.now() - 30 * DAY),
      status: 'expired',
    });

    await createAccessLogEntry(patient._id, doctor._id, records[0]._id);
    await createAccessLogEntry(patient._id, doctor._id, records[1]._id);
    await createAccessLogEntry(patient._id, doctor._id, records[2]._id, { accessResult: 'denied' });
    await createAccessLogEntry(patient._id, doctor._id, records[0]._id, { accessResult: 'denied' });

    await ActivityLog.create([
      { actorId: patient._id, actorRole: 'patient', action: 'auth.login', description: 'Signed in', targetType: 'User' },
      { actorId: patient._id, actorRole: 'patient', action: 'access_request.approved', description: 'Approved', targetType: 'AccessRequest' },
      { actorId: patient._id, actorRole: 'patient', action: 'auth.logout', description: 'Signed out', targetType: 'User' },
    ]);

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { stats, recentRecords, recentRequests, recentActivity, activityTrend } = res.body.data;
    expect(stats.totalRecords).toBe(3);
    expect(stats.pendingRequests).toBe(2);
    expect(stats.activeConsents).toBe(2);
    expect(stats.expiringConsents).toBe(1);
    expect(stats.expiringWindowDays).toBe(30);
    expect(stats.grantedAccessEvents).toBe(2);
    expect(stats.deniedAccessEvents).toBe(2);

    const categoryTotal = stats.recordsByCategory.reduce((sum, row) => sum + row.count, 0);
    expect(categoryTotal).toBe(3);

    expect(recentRecords).toHaveLength(3);
    expect(recentRequests).toHaveLength(3);
    // The audit trail also legitimately contains the sign-in that created the
    // session, so assert presence rather than an exact count.
    expect(recentActivity.length).toBeGreaterThanOrEqual(3);
    expect(recentActivity.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['access_request.approved', 'auth.logout'])
    );
    expect(activityTrend).toHaveLength(6);
    expect(activityTrend.reduce((sum, bucket) => sum + bucket.count, 0)).toBeGreaterThanOrEqual(3);
    expectNoSensitiveFields(res);
  });

  it('never counts another patient\'s data', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const doctor = await createDoctor();

    await createRecord(patient._id);
    await createRecord(other._id);
    await createRecord(other._id);
    await createRequest(other._id, doctor._id, [await createRecord(other._id)]);
    await createNotification(other._id);

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalRecords).toBe(1);
    expect(res.body.data.stats.pendingRequests).toBe(0);

    const otherAgent = await signIn('neha.verma@example.com');
    const otherRes = await otherAgent.get('/api/v1/patient/dashboard');
    expect(otherRes.body.data.stats.totalRecords).toBe(3);
  });

  it('handles an empty vault gracefully', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalRecords).toBe(0);
    expect(res.body.data.stats.activeConsents).toBe(0);
    expect(res.body.data.recentRecords).toEqual([]);
    expect(res.body.data.recentRequests).toEqual([]);
    // Only the audit entry for the sign-in that opened this session exists.
    expect(res.body.data.recentActivity.every((entry) => entry.action.startsWith('auth.'))).toBe(true);
    expect(res.body.data.activityTrend).toHaveLength(6);
  });
});

describe('Phase 5 - patient medical records', () => {
  it('lists only the authenticated patient\'s records', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    await createRecord(patient._id, { recordTitle: 'Mine A' });
    await createRecord(patient._id, { recordTitle: 'Mine B' });
    await createRecord(other._id, { recordTitle: 'Theirs' });
    await createRecord(patient._id, { recordTitle: 'Deleted', recordStatus: 'deleted' });

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/records');

    expect(res.status).toBe(200);
    expect(res.body.data.records).toHaveLength(2);
    expect(res.body.data.records.map((record) => record.recordTitle).sort()).toEqual(['Mine A', 'Mine B']);
    expect(res.body.data.pagination.total).toBe(2);
    expectNoSensitiveFields(res);
  });

  it('returns the safe record metadata the portal displays', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    await createRecord(patient._id, {
      recordTitle: 'Complete Blood Count',
      category: 'Laboratory Report',
      hospitalName: 'Lakeside Clinic',
      doctorName: 'Dr. Anita Rao',
      reportDate: new Date('2026-02-01T00:00:00.000Z'),
    });

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/records');
    const [record] = res.body.data.records;

    expect(record.recordTitle).toBe('Complete Blood Count');
    expect(record.category).toBe('Laboratory Report');
    expect(record.hospitalName).toBe('Lakeside Clinic');
    expect(record.doctorName).toBe('Dr. Anita Rao');
    expect(record.reportDate).toBeTruthy();
    expect(record.uploadedAt).toBeTruthy();
    expect(record.encryptionStatus).toBe('pending');
    expect(record.integrityStatus).toBe('pending');
    expect(record.recordStatus).toBe('active');
    expect(record.fileReference).toBeUndefined();
    expect(record.originalFileName).toBeUndefined();
  });

  it('supports search, category, date, sort and pagination filters', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    await createRecord(patient._id, {
      recordTitle: 'Chest X-Ray',
      category: 'X-ray Report',
      hospitalName: 'Sunrise Multispeciality Hospital',
      reportDate: new Date('2026-01-05T00:00:00.000Z'),
    });
    await createRecord(patient._id, {
      recordTitle: 'Lipid Profile',
      category: 'Laboratory Report',
      hospitalName: 'Lakeside Clinic',
      reportDate: new Date('2026-03-10T00:00:00.000Z'),
    });
    await createRecord(patient._id, {
      recordTitle: 'Thyroid Panel',
      category: 'Laboratory Report',
      hospitalName: 'Lakeside Clinic',
      reportDate: new Date('2026-06-20T00:00:00.000Z'),
    });

    const agent = await signIn('aarav.sharma@example.com');

    // Search by record title.
    const byTitle = await agent.get('/api/v1/patient/records').query({ search: 'thyroid' });
    expect(byTitle.status).toBe(200);
    expect(byTitle.body.data.records).toHaveLength(1);
    expect(byTitle.body.data.records[0].recordTitle).toBe('Thyroid Panel');

    // Search by hospital name.
    const byHospital = await agent.get('/api/v1/patient/records').query({ search: 'lakeside' });
    expect(byHospital.body.data.records).toHaveLength(2);

    // Category filter.
    const byCategory = await agent
      .get('/api/v1/patient/records')
      .query({ category: 'Laboratory Report' });
    expect(byCategory.body.data.records).toHaveLength(2);

    // Date range filter on the report date.
    const byDate = await agent
      .get('/api/v1/patient/records')
      .query({ from: '2026-03-01', to: '2026-04-01' });
    expect(byDate.body.data.records).toHaveLength(1);
    expect(byDate.body.data.records[0].recordTitle).toBe('Lipid Profile');

    // Sorting by report date.
    const ascending = await agent
      .get('/api/v1/patient/records')
      .query({ sortBy: 'reportDate', sortOrder: 'asc' });
    expect(ascending.body.data.records.map((record) => record.recordTitle)).toEqual([
      'Chest X-Ray',
      'Lipid Profile',
      'Thyroid Panel',
    ]);

    const descending = await agent
      .get('/api/v1/patient/records')
      .query({ sortBy: 'reportDate', sortOrder: 'desc' });
    expect(descending.body.data.records[0].recordTitle).toBe('Thyroid Panel');

    // Pagination.
    const page1 = await agent.get('/api/v1/patient/records').query({ limit: 2, page: 1 });
    expect(page1.body.data.records).toHaveLength(2);
    expect(page1.body.data.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2, hasMore: true });

    const page2 = await agent.get('/api/v1/patient/records').query({ limit: 2, page: 2 });
    expect(page2.body.data.records).toHaveLength(1);
    expect(page2.body.data.pagination.hasMore).toBe(false);
  });

  it('rejects unsupported filter values and invalid dates', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    const agent = await signIn('aarav.sharma@example.com');

    const badCategory = await agent
      .get('/api/v1/patient/records')
      .query({ category: 'Not A Category' });
    expect(badCategory.status).toBe(400);
    expect(badCategory.body.code).toBe('INVALID_RECORD_CATEGORY');

    const badDate = await agent.get('/api/v1/patient/records').query({ from: 'not-a-date' });
    expect(badDate.status).toBe(400);

    const badSort = await agent.get('/api/v1/patient/records').query({ sortBy: 'passwordHash' });
    expect(badSort.status).toBe(400);
  });

  it('reads a single owned record and hides another patient\'s record behind a 404', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const mine = await createRecord(patient._id, { recordTitle: 'My Scan' });
    const theirs = await createRecord(other._id, { recordTitle: 'Their Scan' });

    const agent = await signIn('aarav.sharma@example.com');

    const owned = await agent.get(`/api/v1/patient/records/${mine._id}`);
    expect(owned.status).toBe(200);
    expect(owned.body.data.record.recordTitle).toBe('My Scan');
    expectNoSensitiveFields(owned);

    const foreign = await agent.get(`/api/v1/patient/records/${theirs._id}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('RECORD_NOT_FOUND');

    const invalid = await agent.get('/api/v1/patient/records/not-an-object-id');
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_RECORD_ID');

    const unknown = await agent.get('/api/v1/patient/records/64b7f0c8f1a2b3c4d5e6f7a8');
    expect(unknown.status).toBe(404);
  });
});

describe('Phase 5 - doctor access requests', () => {
  it('shows the patient their own requests with doctor and record detail', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id, { recordTitle: 'ECG Report' });
    await createRequest(patient._id, doctor._id, [record._id]);

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/requests');

    expect(res.status).toBe(200);
    expect(res.body.data.pendingCount).toBe(1);
    expect(res.body.data.requests).toHaveLength(1);

    const [request] = res.body.data.requests;
    expect(request.status).toBe('pending');
    expect(request.doctor.fullName).toBe('Dr. Rohan Mehta');
    expect(request.doctor.specialization).toBe('Cardiology');
    expect(request.doctor.hospitalName).toBe('Sunrise Multispeciality Hospital');
    expect(request.purpose).toBe('Continuity of care review');
    expect(request.requestedDuration).toBe(30);
    expect(request.requestedRecords).toHaveLength(1);
    expect(request.requestedRecords[0].recordTitle).toBe('ECG Report');
    // A request is never a blockchain permission.
    expect(request.grantedOnChain).toBe(false);
    expectNoSensitiveFields(res);
  });

  it('never shows another patient\'s requests', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const doctor = await createDoctor();
    const otherRecord = await createRecord(other._id);

    await createRequest(other._id, doctor._id, [otherRecord._id]);

    const agent = await signIn('aarav.sharma@example.com');
    const list = await agent.get('/api/v1/patient/requests');
    expect(list.body.data.requests).toHaveLength(0);

    const foreign = await agent.get('/api/v1/patient/requests');
    expect(foreign.body.data.pendingCount).toBe(0);

    const request = await AccessRequest.findOne({ patientId: other._id });
    const approve = await agent.patch(`/api/v1/patient/requests/${request._id}/approve`);
    expect(approve.status).toBe(404);
    expect(approve.body.code).toBe('REQUEST_NOT_FOUND');
  });

  it('approves a pending request without creating a consent or a transaction', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id);
    const request = await createRequest(patient._id, doctor._id, [record._id]);

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.patch(`/api/v1/patient/requests/${request._id}/approve`);

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('approved');
    expect(res.body.data.request.patientResponseDate).toBeTruthy();
    expect(res.body.data.consentCreated).toBe(false);
    expect(res.body.data.blockchainBacked).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/transactionHash|txHash|0x[a-fA-F0-9]{64}/);

    const stored = await AccessRequest.findById(request._id);
    expect(stored.status).toBe('approved');
    expect(stored.patientResponseDate).toBeTruthy();

    // CRITICAL: an approval records a decision - it must not create a consent.
    expect(await Consent.countDocuments({ patientId: patient._id })).toBe(0);

    const log = await ActivityLog.findOne({ action: 'access_request.approved' });
    expect(log).toBeTruthy();
    expect(String(log.actorId)).toBe(String(patient._id));
    expect(log.actorRole).toBe('patient');

    // The doctor is notified in-app (practical notification, not email/SMS).
    const notification = await Notification.findOne({ recipientId: doctor._id });
    expect(notification).toBeTruthy();
    expect(notification.notificationType).toBe('consent_approved');
  });

  it('rejects a pending request and requires a reason', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id);
    const request = await createRequest(patient._id, doctor._id, [record._id]);

    const agent = await signIn('aarav.sharma@example.com');

    const missing = await agent.patch(`/api/v1/patient/requests/${request._id}/reject`).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.errors?.[0]?.field).toBe('reason');

    const short = await agent
      .patch(`/api/v1/patient/requests/${request._id}/reject`)
      .send({ reason: 'no' });
    expect(short.status).toBe(400);

    const res = await agent
      .patch(`/api/v1/patient/requests/${request._id}/reject`)
      .send({ reason: 'I prefer to share these records in person' });

    expect(res.status).toBe(200);
    expect(res.body.data.request.status).toBe('rejected');
    expect(res.body.data.request.rejectionReason).toBe('I prefer to share these records in person');
    expect(res.body.data.consentCreated).toBe(false);

    const stored = await AccessRequest.findById(request._id);
    expect(stored.status).toBe('rejected');
    expect(stored.rejectionReason).toBe('I prefer to share these records in person');
    expect(stored.patientResponseDate).toBeTruthy();

    expect(await Consent.countDocuments({ patientId: patient._id })).toBe(0);

    const log = await ActivityLog.findOne({ action: 'access_request.rejected' });
    expect(log).toBeTruthy();
    expect(log.metadata.reason).toBe('I prefer to share these records in person');
  });

  it('refuses to process an already decided or cancelled request', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const doctor = await createDoctor();
    const records = [
      await createRecord(patient._id),
      await createRecord(patient._id),
      await createRecord(patient._id),
      await createRecord(patient._id),
    ];
    const approved = await createRequest(patient._id, doctor._id, [records[0]._id]);
    const rejected = await createRequest(patient._id, doctor._id, [records[1]._id], { status: 'rejected' });
    const cancelled = await createRequest(patient._id, doctor._id, [records[2]._id], { status: 'cancelled' });
    const revoked = await createRequest(patient._id, doctor._id, [records[3]._id], { status: 'cancelled' });

    const agent = await signIn('aarav.sharma@example.com');

    await agent.patch(`/api/v1/patient/requests/${approved._id}/approve`).expect(200);
    const again = await agent.patch(`/api/v1/patient/requests/${approved._id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('REQUEST_ALREADY_PROCESSED');

    const rejectApproved = await agent
      .patch(`/api/v1/patient/requests/${approved._id}/reject`)
      .send({ reason: 'Trying to switch the decision' });
    expect(rejectApproved.status).toBe(409);
    expect(rejectApproved.body.code).toBe('REQUEST_ALREADY_PROCESSED');

    const reReject = await agent
      .patch(`/api/v1/patient/requests/${rejected._id}/reject`)
      .send({ reason: 'Trying to reject again' });
    expect(reReject.status).toBe(409);

    const rejectCancelled = await agent
      .patch(`/api/v1/patient/requests/${cancelled._id}/reject`)
      .send({ reason: 'Trying to reject a cancelled request' });
    expect(rejectCancelled.status).toBe(409);

    const approveCancelled = await agent.patch(`/api/v1/patient/requests/${revoked._id}/approve`);
    expect(approveCancelled.status).toBe(409);
  });

  it('handles invalid request ids and requests pointing at foreign records', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const doctor = await createDoctor();
    const foreignRecord = await createRecord(other._id);
    const ownRecord = await createRecord(patient._id);

    // A tampered request that references another patient's record.
    const tampered = await createRequest(patient._id, doctor._id, [foreignRecord._id]);
    const alsoTampered = await createRequest(patient._id, doctor._id, [ownRecord._id, foreignRecord._id]);

    const agent = await signIn('aarav.sharma@example.com');

    const malformed = await agent.patch('/api/v1/patient/requests/not-an-id/approve');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('INVALID_REQUEST_ID');

    const unknown = await agent.patch('/api/v1/patient/requests/64b7f0c8f1a2b3c4d5e6f7a8/approve');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('REQUEST_NOT_FOUND');

    const mismatch = await agent.patch(`/api/v1/patient/requests/${tampered._id}/approve`);
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe('REQUEST_RECORD_MISMATCH');

    const partial = await agent.patch(`/api/v1/patient/requests/${alsoTampered._id}/approve`);
    expect(partial.status).toBe(400);
    expect(partial.body.code).toBe('REQUEST_RECORD_MISMATCH');

    // Neither request may have been processed by the failed attempts.
    const stored = await AccessRequest.findById(tampered._id);
    expect(stored.status).toBe('pending');
  });
});

describe('Phase 5 - consents and history', () => {
  it('lists only the patient\'s consents and never invents a transaction reference', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id);
    const otherRecord = await createRecord(other._id);

    await createConsent(patient._id, doctor._id, [record._id], {
      expiresAt: new Date(Date.now() + 20 * DAY),
    });
    await createConsent(patient._id, doctor._id, [record._id], {
      grantedAt: new Date(Date.now() - 90 * DAY),
      expiresAt: new Date(Date.now() - 40 * DAY),
    });
    await createConsent(other._id, doctor._id, [otherRecord._id]);

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/consents');

    expect(res.status).toBe(200);
    expect(res.body.data.consents).toHaveLength(2);
    expect(res.body.data.counts.total).toBe(2);

    const statuses = res.body.data.consents.map((consent) => consent.status).sort();
    expect(statuses).toEqual(['active', 'expired']);

    for (const consent of res.body.data.consents) {
      expect(consent.doctor.fullName).toBe('Dr. Rohan Mehta');
      expect(consent.transactionReference).toBeNull();
      expect(consent.blockchainBacked).toBe(false);
      expect(consent.authorizedRecords[0].recordTitle).toBeTruthy();
    }

    const expired = res.body.data.consents.find((consent) => consent.status === 'expired');
    expect(expired.expiresAt).toBeTruthy();
    expectNoSensitiveFields(res);
  });

  it('surfaces a real transaction reference only when one is stored', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id);
    const hash = `0x${'ab'.repeat(32)}`;

    await createConsent(patient._id, doctor._id, [record._id], { transactionHash: hash });

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/consents');

    expect(res.body.data.consents[0].transactionReference).toBe(hash);
    expect(res.body.data.consents[0].blockchainBacked).toBe(true);
    expect(res.body.data.counts.blockchainBacked).toBe(1);
  });

  it('scopes consent history and keeps decisions distinct from on-chain consent', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id);
    const otherRecord = await createRecord(other._id);

    await createConsent(patient._id, doctor._id, [record._id], { transactionHash: `0x${'cd'.repeat(32)}` });
    await createRequest(patient._id, doctor._id, [record._id], {
      status: 'approved',
      patientResponseDate: new Date(),
    });
    await createRequest(patient._id, doctor._id, [record._id], {
      status: 'rejected',
      patientResponseDate: new Date(),
      rejectionReason: 'Not needed',
    });
    await createRequest(patient._id, doctor._id, [record._id]); // still pending
    await createRequest(other._id, doctor._id, [otherRecord._id], { status: 'approved', patientResponseDate: new Date() });

    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/consent-history');

    expect(res.status).toBe(200);
    // 1 consent + 2 decided requests; the other patient's approval is excluded.
    expect(res.body.data.entries).toHaveLength(3);
    expect(res.body.data.pagination.total).toBe(3);

    const sources = res.body.data.entries.map((entry) => entry.source).sort();
    expect(sources).toEqual(['access_request', 'access_request', 'consent']);

    const consentEntry = res.body.data.entries.find((entry) => entry.source === 'consent');
    expect(consentEntry.transactionReference).toBe(`0x${'cd'.repeat(32)}`);
    expect(consentEntry.blockchainBacked).toBe(true);

    const approvedEntry = res.body.data.entries.find((entry) => entry.decision === 'approved');
    expect(approvedEntry.transactionReference).toBeNull();
    expect(approvedEntry.blockchainBacked).toBe(false);

    const rejectedEntry = res.body.data.entries.find((entry) => entry.decision === 'rejected');
    expect(rejectedEntry.rejectionReason).toBe('Not needed');

    expectNoSensitiveFields(res);
  });

  it('scopes the medical record access history to the authenticated patient', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id, { recordTitle: 'Discharge Summary' });
    const otherRecord = await createRecord(other._id);

    await createAccessLogEntry(patient._id, doctor._id, record._id, {
      accessResult: 'denied',
      reason: 'Consent expired',
    });
    await createAccessLogEntry(patient._id, doctor._id, record._id, { reason: null });
    await createAccessLogEntry(other._id, doctor._id, otherRecord._id);

    const agent = await signIn('aarav.sharma@example.com');

    const malformed = await agent.get('/api/v1/patient/access-history').query({ result: 'sometimes' });
    expect(malformed.status).toBe(400);

    const res = await agent.get('/api/v1/patient/access-history');

    expect(res.status).toBe(200);
    expect(res.body.data.entries).toHaveLength(2);
    expect(res.body.data.counts).toMatchObject({ total: 2, granted: 1, denied: 1 });

    const denied = res.body.data.entries.find((entry) => entry.accessResult === 'denied');
    expect(denied.reason).toBe('Consent expired');
    expect(denied.doctor.fullName).toBe('Dr. Rohan Mehta');
    expect(denied.record.recordTitle).toBe('Discharge Summary');

    // Newest first.
    const timestamps = res.body.data.entries.map((entry) => new Date(entry.accessedAt).getTime());
    expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);

    expectNoSensitiveFields(res);
  });

  it('returns an empty access history when nothing has been accessed', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    const agent = await signIn('aarav.sharma@example.com');
    const res = await agent.get('/api/v1/patient/access-history');

    expect(res.status).toBe(200);
    expect(res.body.data.entries).toEqual([]);
    expect(res.body.data.counts).toMatchObject({ total: 0, granted: 0, denied: 0 });
  });
});

describe('Phase 5 - patient profile', () => {
  it('returns the profile and updates only the permitted fields', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    const agent = await signIn('aarav.sharma@example.com');

    const before = await agent.get('/api/v1/patient/profile');
    expect(before.status).toBe(200);
    expect(before.body.user.email).toBe('aarav.sharma@example.com');
    expect(before.body.user.passwordHash).toBeUndefined();
    expectNoSensitiveFields(before);

    const res = await agent.patch('/api/v1/patient/profile').send({
      fullName: 'Aarav R. Sharma',
      mobileNumber: '+91 98200 99887',
      dateOfBirth: '1994-05-12',
      gender: 'male',
      address: '12 Marine Drive, Mumbai',
      emergencyContact: 'Priya Sharma · +91 98200 11111',
      bloodGroup: 'O+',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Aarav R. Sharma');
    expect(res.body.user.mobileNumber).toBe('+91 98200 99887');
    expect(res.body.user.gender).toBe('male');
    expect(res.body.user.bloodGroup).toBe('O+');
    expect(res.body.user.address).toBe('12 Marine Drive, Mumbai');
    expect(res.body.user.passwordHash).toBeUndefined();

    const stored = await User.findById(before.body.user.id);
    expect(stored.fullName).toBe('Aarav R. Sharma');
    expect(stored.bloodGroup).toBe('O+');

    const log = await ActivityLog.findOne({ action: 'patient.profile_updated' });
    expect(log).toBeTruthy();
    expect(log.metadata.fields).toContain('fullName');
    // No values are written into the audit trail.
    expect(JSON.stringify(log.metadata)).not.toMatch(/Aarav R\. Sharma/);
  });

  it('validates profile input', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    const agent = await signIn('aarav.sharma@example.com');

    const badMobile = await agent.patch('/api/v1/patient/profile').send({ mobileNumber: 'abc' });
    expect(badMobile.status).toBe(400);

    const badGender = await agent.patch('/api/v1/patient/profile').send({ gender: 'alien' });
    expect(badGender.status).toBe(400);

    const badBlood = await agent.patch('/api/v1/patient/profile').send({ bloodGroup: 'C+' });
    expect(badBlood.status).toBe(400);

    const futureDob = await agent
      .patch('/api/v1/patient/profile')
      .send({ dateOfBirth: '2099-01-01' });
    expect(futureDob.status).toBe(400);

    const localPath = await agent
      .patch('/api/v1/patient/profile')
      .send({ profilePhoto: 'C:\\Users\\HP\\secret.png' });
    expect(localPath.status).toBe(400);

    const empty = await agent.patch('/api/v1/patient/profile').send({});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('NO_UPDATABLE_FIELDS');

    const stored = await User.findOne({ email: 'aarav.sharma@example.com' });
    expect(stored.mobileNumber).toBe('+91 98200 11223');
  });

  it('refuses to change protected account fields', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const agent = await signIn('aarav.sharma@example.com');

    const attempts = [
      { email: 'attacker@example.com', code: 'EMAIL_CHANGE_NOT_SUPPORTED' },
      { role: 'admin', code: 'PROTECTED_FIELD' },
      { accountStatus: 'suspended', code: 'PROTECTED_FIELD' },
      { verificationStatus: 'verified', code: 'PROTECTED_FIELD' },
      { passwordHash: '$2a$12$abcdefghijklmnopqrstuv', code: 'PROTECTED_FIELD' },
      { walletAddress: '0x0000000000000000000000000000000000000000', code: 'PROTECTED_FIELD' },
      { verifiedAt: new Date().toISOString(), code: 'PROTECTED_FIELD' },
    ];

    for (const { email, role, accountStatus, verificationStatus, passwordHash, walletAddress, verifiedAt, code } of attempts) {
      const body = { email, role, accountStatus, verificationStatus, passwordHash, walletAddress, verifiedAt };
      const payload = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
      const res = await agent.patch('/api/v1/patient/profile').send(payload);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    }

    const stored = await User.findById(patient._id).select('+passwordHash');
    expect(stored.email).toBe('aarav.sharma@example.com');
    expect(stored.role).toBe('patient');
    expect(stored.accountStatus).toBe('active');
    expect(stored.verificationStatus).toBe('not_applicable');
    expect(stored.walletAddress).toBeNull();
    expect(stored.passwordHash).toBe(patient.passwordHash);
  });
});

describe('Phase 5 - patient notifications', () => {
  it('lists the patient\'s notifications with an unread count and marks them read', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    await createNotification(patient._id, { title: 'New access request' });
    await createNotification(patient._id, { title: 'Consent expiring soon', isRead: true });
    await createNotification(patient._id, { title: 'Welcome to MediConsent' });

    const agent = await signIn('aarav.sharma@example.com');

    const list = await agent.get('/api/v1/patient/notifications');
    expect(list.status).toBe(200);
    expect(list.body.data.notifications).toHaveLength(3);
    expect(list.body.data.unreadCount).toBe(2);

    const target = list.body.data.notifications.find((notification) => !notification.isRead);
    const read = await agent.patch(`/api/v1/patient/notifications/${target.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.notification.isRead).toBe(true);
    expect(read.body.data.unreadCount).toBe(1);

    const stored = await Notification.findById(target.id);
    expect(stored.isRead).toBe(true);

    const readAll = await agent.patch('/api/v1/patient/notifications/read-all');
    expect(readAll.status).toBe(200);
    expect(readAll.body.data.unreadCount).toBe(0);
    expect(await Notification.countDocuments({ recipientId: patient._id, isRead: false })).toBe(0);
  });

  it('never lets a patient read or modify another user\'s notifications', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const other = await createOtherPatient();
    const foreign = await createNotification(other._id, { title: 'Private notification' });

    const agent = await signIn('aarav.sharma@example.com');

    const list = await agent.get('/api/v1/patient/notifications');
    expect(list.body.data.notifications).toHaveLength(0);
    expect(JSON.stringify(list.body)).not.toMatch(/Private notification/);

    const read = await agent.patch(`/api/v1/patient/notifications/${foreign._id}/read`);
    expect(read.status).toBe(404);
    expect(read.body.code).toBe('NOTIFICATION_NOT_FOUND');

    const stillUnread = await Notification.findById(foreign._id);
    expect(stillUnread.isRead).toBe(false);

    // read-all must not touch another user's rows either.
    await agent.patch('/api/v1/patient/notifications/read-all');
    const untouched = await Notification.findById(foreign._id);
    expect(untouched.isRead).toBe(false);

    const malformed = await agent.patch('/api/v1/patient/notifications/not-an-id/read');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('INVALID_NOTIFICATION_ID');
  });
});

describe('Phase 5 - patient API security boundaries', () => {
  it('rejects unauthenticated requests with 401', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const paths = [
      '/api/v1/patient/dashboard',
      '/api/v1/patient/records',
      '/api/v1/patient/requests',
      '/api/v1/patient/consents',
      '/api/v1/patient/consent-history',
      '/api/v1/patient/access-history',
      '/api/v1/patient/profile',
      '/api/v1/patient/notifications',
    ];

    for (const path of paths) {
      const res = await request(app).get(path);
      expect(res.status, `${path} should require authentication`).toBe(401);
    }

    const approve = await request(app).patch('/api/v1/patient/requests/64b7f0c8f1a2b3c4d5e6f7a8/approve');
    expect(approve.status).toBe(401);

    const readAll = await request(app).patch('/api/v1/patient/notifications/read-all');
    expect(readAll.status).toBe(401);
  });

  it('rejects doctor and admin sessions on patient-only endpoints', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    await createDoctor();
    await createAdmin();

    for (const email of ['rohan.mehta@example.com', 'admin@example.com']) {
      const agent = await signIn(email);
      const paths = [
        '/api/v1/patient/dashboard',
        '/api/v1/patient/records',
        '/api/v1/patient/requests',
        '/api/v1/patient/consents',
        '/api/v1/patient/consent-history',
        '/api/v1/patient/access-history',
        '/api/v1/patient/profile',
        '/api/v1/patient/notifications',
        '/api/v1/patient/access',
      ];

      for (const path of paths) {
        const res = await agent.get(path);
        expect(res.status, `${email} -> ${path}`).toBe(403);
      }

      const patchProfile = await agent.patch('/api/v1/patient/profile').send({ fullName: 'Renamed' });
      expect(patchProfile.status).toBe(403);

      const readAll = await agent.patch('/api/v1/patient/notifications/read-all');
      expect(readAll.status).toBe(403);
    }
  });

  it('still grants the patient role-guard probe (Phase 4 regression)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    const agent = await signIn('aarav.sharma@example.com');

    const res = await agent.get('/api/v1/patient/access');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('patient');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('does not expose any unauthenticated, public or arbitrary file CRUD routes', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const record = await createRecord(patient._id);
    const agent = await signIn('aarav.sharma@example.com');

    const notFoundAttempts = [
      ['get', `/api/v1/patient/records/${record._id}/file`],
      ['get', `/api/v1/patient/records/${record._id}/preview`],
      ['get', '/api/v1/patient/files'],
      ['post', '/api/v1/patient/records/upload'],
      ['delete', `/api/v1/patient/records/${record._id}`],
      ['post', '/api/v1/patient/consents'],
    ];

    for (const [method, path] of notFoundAttempts) {
      const res = await agent[method](path).send({});
      expect(res.status, `${method.toUpperCase()} ${path} must not exist`).toBe(404);
    }

    // Direct JSON post without file to POST /records is rejected as 400 (requires multipart file)
    const emptyUpload = await agent.post('/api/v1/patient/records').send({});
    expect(emptyUpload.status).toBe(400);

    // Approving a request must not make a record reachable as a file.
    const stored = await MedicalRecord.findById(record._id);
    expect(stored).toBeTruthy();
    expect(stored.fileReference).toContain('private/records');
  });

  it('never lets a patient write audit or access-log entries', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const patient = await createPatient();
    const doctor = await createDoctor();
    const record = await createRecord(patient._id);
    await createAccessLogEntry(patient._id, doctor._id, record._id);

    const agent = await signIn('aarav.sharma@example.com');

    for (const path of ['/api/v1/patient/access-logs', '/api/v1/patient/activity-logs', '/api/v1/patient/logs']) {
      const res = await agent.post(path).send({ accessResult: 'granted' });
      expect(res.status).toBe(404);
    }

    // Reading history is fine; writing is not possible through the API.
    const history = await agent.get('/api/v1/patient/access-history');
    expect(history.status).toBe(200);
    expect(history.body.data.entries).toHaveLength(1);
    expect(await AccessLog.countDocuments({ patientId: patient._id })).toBe(1);
  });
});
