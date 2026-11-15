import mongoMemoryServer from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import AccessRequest from '../models/AccessRequest.js';
import ActivityLog from '../models/ActivityLog.js';
import Consent from '../models/Consent.js';
import MedicalRecord from '../models/MedicalRecord.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';

const { MongoMemoryServer } = mongoMemoryServer;

/**
 * Phase 7 - administrator portal.
 *
 * Uses a local in-memory MongoDB instance; no Atlas cluster is contacted.
 * Everything asserted below is read back from that database - no statistic,
 * activity entry or notification is fabricated by these tests.
 */

const TEST_DB_NAME = 'mediconsent_phase7_admin_test';
const PASSWORD = 'AdminPass123';

let mongoServer = null;
let mongoAvailable = false;
let startupError = null;

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

const createAdmin = (overrides = {}) =>
  createUser({
    fullName: 'MediConsent Administrator',
    email: 'admin@example.com',
    role: 'admin',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    ...overrides,
  });

const createPatient = (overrides = {}) =>
  createUser({ fullName: 'Patient One', email: 'patient.one@example.com', role: 'patient', ...overrides });

const createPendingDoctor = (overrides = {}) =>
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

const createVerifiedDoctor = (overrides = {}) =>
  createUser({
    fullName: 'Dr. Ananya Rao',
    email: 'ananya.rao@example.com',
    mobileNumber: '+91 98195 11111',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    verifiedAt: new Date(),
    medicalRegistrationNumber: 'MCI-2019-00001',
    specialization: 'Neurology',
    hospitalName: 'Lakeside Clinic',
    ...overrides,
  });

async function createRecord(patientId, overrides = {}) {
  return MedicalRecord.create({
    patientId,
    recordTitle: 'Discharge Summary - Secret Title',
    category: 'Discharge Summary',
    hospitalName: 'Sunrise Multispeciality Hospital',
    reportDate: new Date('2026-01-10T00:00:00Z'),
    fileReference: 'private://vault/DISCHARGE-SECRET-REF.pdf',
    originalFileName: 'discharge.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    ...overrides,
  });
}

const createActivityLog = (overrides = {}) =>
  ActivityLog.create({
    actorRole: 'admin',
    action: 'doctor.approved',
    description: 'A doctor application was approved',
    targetType: 'User',
    ...overrides,
  });

const createNotification = (recipientId, overrides = {}) =>
  Notification.create({
    recipientId,
    title: 'Test notification',
    message: 'A notification created by the Phase 7 suite.',
    notificationType: 'system',
    ...overrides,
  });

/** An agent already signed in as the given account. */
async function signIn(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/**
 * Sign in, then clear the audit trail.
 *
 * Signing in genuinely records an `auth.login` entry, so a test that asserts on
 * a known set of audit entries starts from an empty trail after authenticating.
 */
async function signInWithCleanAudit(email) {
  const agent = await signIn(email);
  await ActivityLog.deleteMany({});
  return agent;
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
    console.warn('[admin.phase7.test] In-memory MongoDB unavailable:', err.message);
  }
}, 180000);

afterAll(async () => {
  if (mongoAvailable) {
    await Promise.all([
      User.deleteMany({}),
      ActivityLog.deleteMany({}),
      Notification.deleteMany({}),
      AccessRequest.deleteMany({}),
      Consent.deleteMany({}),
      MedicalRecord.deleteMany({}),
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
    ActivityLog.deleteMany({}),
    Notification.deleteMany({}),
    AccessRequest.deleteMany({}),
    Consent.deleteMany({}),
    MedicalRecord.deleteMany({}),
  ]);
});

describe('Phase 7 - admin dashboard', () => {
  it('returns genuine MongoDB statistics', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const admin = await createAdmin();
    await createPatient({ email: 'p1@example.com' });
    const suspendedPatient = await createPatient({
      email: 'p2@example.com',
      fullName: 'Suspended Patient',
      accountStatus: 'suspended',
    });
    const doctor = await createVerifiedDoctor();
    await createPendingDoctor();
    await createUser({
      fullName: 'Dr. Rejected',
      email: 'rejected@example.com',
      role: 'doctor',
      accountStatus: 'rejected',
      verificationStatus: 'rejected',
      medicalRegistrationNumber: 'MCI-2020-55555',
      specialization: 'Dermatology',
      hospitalName: 'City Clinic',
    });

    await AccessRequest.create({
      patientId: suspendedPatient._id,
      doctorId: doctor._id,
      requestedCategories: ['Prescription'],
      purpose: 'Continuity of care for a follow-up consultation',
      requestedDuration: 30,
      status: 'pending',
    });
    await AccessRequest.create({
      patientId: suspendedPatient._id,
      doctorId: doctor._id,
      requestedCategories: ['Laboratory Report'],
      purpose: 'Reviewing recent laboratory results',
      requestedDuration: 14,
      status: 'approved',
    });

    const record = await createRecord(suspendedPatient._id);
    await Consent.create({
      patientId: suspendedPatient._id,
      doctorId: doctor._id,
      authorizedRecords: [record._id],
      purpose: 'Active consent for treatment',
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active',
    });
    // An already-expired consent must NOT be counted as active.
    await Consent.create({
      patientId: suspendedPatient._id,
      doctorId: doctor._id,
      authorizedRecords: [record._id],
      purpose: 'Expired consent',
      grantedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      status: 'active',
    });

    const agent = await signInWithCleanAudit('admin@example.com');
    await createActivityLog({ actorId: admin._id, action: 'doctor.approved' });

    const res = await agent.get('/api/v1/admin/dashboard');

    expect(res.status).toBe(200);
    const { stats, recentActivity } = res.body.data;

    expect(stats.totalPatients).toBe(2);
    expect(stats.totalDoctors).toBe(3);
    expect(stats.verifiedDoctors).toBe(1);
    expect(stats.pendingDoctorVerifications).toBe(1);
    expect(stats.rejectedDoctors).toBe(1);
    expect(stats.suspendedUsers).toBe(1);
    expect(stats.totalAccessRequests).toBe(2);
    expect(stats.pendingAccessRequests).toBe(1);
    expect(stats.approvedAccessRequests).toBe(1);
    expect(stats.activeConsents).toBe(1);
    expect(Array.isArray(recentActivity)).toBe(true);
    expect(recentActivity).toHaveLength(1);
    expect(recentActivity[0].action).toBe('doctor.approved');
  });

  it('returns zero values and no activity when the platform is empty', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const agent = await signInWithCleanAudit('admin@example.com');
    const res = await agent.get('/api/v1/admin/dashboard');

    expect(res.status).toBe(200);
    const { stats, recentActivity } = res.body.data;

    expect(stats).toMatchObject({
      totalPatients: 0,
      totalDoctors: 0,
      verifiedDoctors: 0,
      pendingDoctorVerifications: 0,
      rejectedDoctors: 0,
      suspendedUsers: 0,
      totalAccessRequests: 0,
      pendingAccessRequests: 0,
      activeConsents: 0,
    });
    expect(recentActivity).toEqual([]);
  });
});

describe('Phase 7 - admin access control', () => {
  it('rejects unauthenticated requests with 401', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const paths = [
      '/api/v1/admin/dashboard',
      '/api/v1/admin/patients',
      '/api/v1/admin/doctors',
      '/api/v1/admin/users',
      '/api/v1/admin/activity-logs',
      '/api/v1/admin/profile',
      '/api/v1/admin/notifications',
    ];

    for (const path of paths) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('blocks patient sessions from admin APIs', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createPatient();
    const agent = await signIn('patient.one@example.com');

    const dashboard = await agent.get('/api/v1/admin/dashboard');
    expect(dashboard.status).toBe(403);

    const users = await agent.get('/api/v1/admin/users');
    expect(users.status).toBe(403);
    expect(users.body.code).toBe('ROLE_NOT_PERMITTED');
  });

  it('blocks doctor sessions from admin APIs', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createVerifiedDoctor();
    const agent = await signIn('ananya.rao@example.com');

    const logs = await agent.get('/api/v1/admin/activity-logs');
    expect(logs.status).toBe(403);
    expect(logs.body.code).toBe('ROLE_NOT_PERMITTED');
  });

  it('blocks an inactive administrator from protected admin APIs', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const admin = await createAdmin();
    const agent = await signIn('admin@example.com');

    // An administrator suspended AFTER signing in must lose access immediately.
    await User.findByIdAndUpdate(admin._id, { accountStatus: 'suspended' });

    const res = await agent.get('/api/v1/admin/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');

    const users = await agent.get('/api/v1/admin/users');
    expect(users.status).toBe(403);
  });
});

describe('Phase 7 - patient management', () => {
  it('lists patient accounts only', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    await createPatient({ email: 'p1@example.com' });
    await createPatient({ email: 'p2@example.com', fullName: 'Patient Two' });
    await createVerifiedDoctor();

    const agent = await signIn('admin@example.com');
    const res = await agent.get('/api/v1/admin/patients');

    expect(res.status).toBe(200);
    expect(res.body.data.patients).toHaveLength(2);
    expect(res.body.data.patients.every((row) => row.role === 'patient')).toBe(true);
    expect(res.body.data.counts).toMatchObject({ total: 2, active: 2, suspended: 0 });
  });

  it('never exposes medical records, file references or storage paths', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const patient = await createPatient();
    await createRecord(patient._id);

    const agent = await signIn('admin@example.com');
    const list = await agent.get('/api/v1/admin/patients');
    const detail = await agent.get(`/api/v1/admin/patients/${patient._id}`);

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);

    for (const res of [list, detail]) {
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('DISCHARGE-SECRET-REF');
      expect(serialized).not.toContain('recordTitle');
      expect(serialized).not.toContain('fileReference');
      expect(serialized).not.toContain('private://');
      expect(serialized).not.toMatch(/passwordHash|\$2[aby]\$/);
    }

    const row = detail.body.data;
    expect(row).not.toHaveProperty('recordTitle');
    expect(row).not.toHaveProperty('diagnosis');
    expect(row).not.toHaveProperty('fileReference');
    expect(row.id).toBe(String(patient._id));
    expect(row.role).toBe('patient');
  });

  it('supports search, pagination and sorting', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    await createPatient({ email: 'asha.kapoor@example.com', fullName: 'Asha Kapoor' });
    await createPatient({ email: 'brian.dsouza@example.com', fullName: 'Brian Dsouza' });
    await createPatient({ email: 'chitra.nair@example.com', fullName: 'Chitra Nair' });

    const agent = await signIn('admin@example.com');

    const search = await agent.get('/api/v1/admin/patients').query({ search: 'brian' });
    expect(search.status).toBe(200);
    expect(search.body.data.patients).toHaveLength(1);
    expect(search.body.data.patients[0].email).toBe('brian.dsouza@example.com');

    const page = await agent.get('/api/v1/admin/patients').query({ limit: 2, page: 1 });
    expect(page.body.data.patients).toHaveLength(2);
    expect(page.body.data.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2, hasMore: true });

    const secondPage = await agent.get('/api/v1/admin/patients').query({ limit: 2, page: 2 });
    expect(secondPage.body.data.patients).toHaveLength(1);

    const sorted = await agent
      .get('/api/v1/admin/patients')
      .query({ sortBy: 'fullName', sortOrder: 'asc' });
    expect(sorted.body.data.patients[0].fullName).toBe('Asha Kapoor');
  });
});

describe('Phase 7 - doctor verification', () => {
  it('lists only pending doctor applications', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    await createPendingDoctor();
    await createVerifiedDoctor();

    const agent = await signIn('admin@example.com');
    const res = await agent.get('/api/v1/admin/doctors/pending');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('rohan.mehta@example.com');
    expect(res.body.data[0].verificationStatus).toBe('pending');
    expect(res.body.counts).toEqual({ pending: 1, verified: 1, rejected: 0 });
  });

  it('approves a pending doctor and records the reviewing administrator', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const admin = await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');

    const res = await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('verified');
    expect(res.body.data.accountStatus).toBe('active');

    const stored = await User.findById(doctor._id);
    expect(stored.verificationStatus).toBe('verified');
    expect(stored.accountStatus).toBe('active');
    expect(stored.verifiedAt).toBeTruthy();
    expect(String(stored.verifiedBy)).toBe(String(admin._id));
  });

  it('rejects a pending doctor and stores the reason', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');

    const res = await agent
      .patch(`/api/v1/admin/doctors/${doctor._id}/reject`)
      .send({ reason: 'Registration certificate could not be verified' });

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('rejected');
    expect(res.body.data.accountStatus).toBe('rejected');

    const stored = await User.findById(doctor._id);
    expect(stored.verificationStatus).toBe('rejected');
    expect(stored.verificationReason).toBe('Registration certificate could not be verified');
  });

  it('requires a rejection reason before changing any state', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');

    const res = await agent.patch(`/api/v1/admin/doctors/${doctor._id}/reject`).send({});
    expect(res.status).toBe(400);

    const stored = await User.findById(doctor._id);
    expect(stored.verificationStatus).toBe('pending');
  });

  it('rejects repeated and invalid verification transitions', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');

    await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`).expect(200);

    const again = await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('APPLICATION_ALREADY_PROCESSED');

    const rejectAfterApprove = await agent
      .patch(`/api/v1/admin/doctors/${doctor._id}/reject`)
      .send({ reason: 'Trying to reprocess an approved doctor' });
    expect(rejectAfterApprove.status).toBe(409);

    // A patient can never be approved as a doctor.
    const patient = await createPatient();
    const wrongRole = await agent.patch(`/api/v1/admin/doctors/${patient._id}/approve`);
    expect(wrongRole.status).toBe(404);
    expect(wrongRole.body.code).toBe('DOCTOR_NOT_FOUND');
  });

  it('notifies the doctor when their application is approved', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');
    await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`).expect(200);

    const notification = await Notification.findOne({ recipientId: doctor._id });
    expect(notification).toBeTruthy();
    expect(notification.notificationType).toBe('doctor_verified');
  });

  it('notifies the doctor when their application is rejected', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');
    await agent
      .patch(`/api/v1/admin/doctors/${doctor._id}/reject`)
      .send({ reason: 'Registration number did not match the register' })
      .expect(200);

    const notification = await Notification.findOne({ recipientId: doctor._id });
    expect(notification).toBeTruthy();
    expect(notification.notificationType).toBe('doctor_rejected');
  });
});

describe('Phase 7 - user management', () => {
  it('lists users with role and status counts', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    await createPatient();
    await createVerifiedDoctor();

    const agent = await signIn('admin@example.com');
    const res = await agent.get('/api/v1/admin/users');

    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(3);
    expect(res.body.data.counts.byRole).toMatchObject({ patient: 1, doctor: 1, admin: 1 });
    expect(res.body.data.counts.byStatus.active).toBe(3);
  });

  it('suspends a patient and a doctor', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const patient = await createPatient();
    const doctor = await createVerifiedDoctor();

    const agent = await signIn('admin@example.com');

    for (const target of [patient, doctor]) {
      const res = await agent.patch(`/api/v1/admin/users/${target._id}/status`).send({ status: 'suspended' });
      expect(res.status).toBe(200);
      expect(res.body.data.accountStatus).toBe('suspended');
    }

    expect((await User.findById(patient._id)).accountStatus).toBe('suspended');
    expect((await User.findById(doctor._id)).accountStatus).toBe('suspended');
    // The verification status must never be silently modified.
    expect((await User.findById(doctor._id)).verificationStatus).toBe('verified');
  });

  it('reactivates a suspended user', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const patient = await createPatient({ accountStatus: 'suspended' });
    const agent = await signIn('admin@example.com');

    const res = await agent.patch(`/api/v1/admin/users/${patient._id}/status`).send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe('active');
    expect((await User.findById(patient._id)).accountStatus).toBe('active');
  });

  it('prevents an administrator from suspending their own account', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const admin = await createAdmin();
    const agent = await signIn('admin@example.com');

    const res = await agent.patch(`/api/v1/admin/users/${admin._id}/status`).send({ status: 'suspended' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_MODIFY_SELF');
    expect((await User.findById(admin._id)).accountStatus).toBe('active');
  });

  it('prevents role changes through user management', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const patient = await createPatient();
    const agent = await signIn('admin@example.com');

    const res = await agent
      .patch(`/api/v1/admin/users/${patient._id}/status`)
      .send({ status: 'active', role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PROTECTED_FIELD');
    expect((await User.findById(patient._id)).role).toBe('patient');
  });

  it('prevents modifying another administrator through user management', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin({ email: 'admin@example.com' });
    const otherAdmin = await createAdmin({ email: 'admin.two@example.com', fullName: 'Second Administrator' });
    const agent = await signIn('admin@example.com');

    const res = await agent.patch(`/api/v1/admin/users/${otherAdmin._id}/status`).send({ status: 'suspended' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_MODIFY_ADMIN');
    expect((await User.findById(otherAdmin._id)).accountStatus).toBe('active');
  });

  it('denies a suspended user access to protected APIs', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const patient = await createPatient();
    const patientAgent = await signIn('patient.one@example.com');
    await patientAgent.get('/api/v1/patient/dashboard').expect(200);

    const adminAgent = await signIn('admin@example.com');
    await adminAgent.patch(`/api/v1/admin/users/${patient._id}/status`).send({ status: 'suspended' }).expect(200);

    // The patient's existing session must now be refused.
    const blocked = await patientAgent.get('/api/v1/patient/dashboard');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('Phase 7 - activity logs', () => {
  it('paginates and filters the audit trail', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const agent = await signInWithCleanAudit('admin@example.com');

    await createActivityLog({ action: 'doctor.approved', actorRole: 'admin', timestamp: new Date('2026-01-15T10:00:00Z') });
    await createActivityLog({ action: 'doctor.rejected', actorRole: 'admin', timestamp: new Date('2026-01-20T10:00:00Z') });
    await createActivityLog({
      action: 'access_request.approved',
      actorRole: 'patient',
      timestamp: new Date('2026-05-20T10:00:00Z'),
    });

    const page = await agent.get('/api/v1/admin/activity-logs').query({ limit: 2, page: 1 });
    expect(page.status).toBe(200);
    expect(page.body.data.logs).toHaveLength(2);
    expect(page.body.data.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    // Newest first.
    expect(page.body.data.logs[0].action).toBe('access_request.approved');

    const byAction = await agent.get('/api/v1/admin/activity-logs').query({ action: 'doctor.approved' });
    expect(byAction.body.data.logs).toHaveLength(1);
    expect(byAction.body.data.logs[0].action).toBe('doctor.approved');

    const byRole = await agent.get('/api/v1/admin/activity-logs').query({ actorRole: 'patient' });
    expect(byRole.body.data.logs).toHaveLength(1);
    expect(byRole.body.data.logs[0].actorRole).toBe('patient');

    const byRange = await agent
      .get('/api/v1/admin/activity-logs')
      .query({ from: '2026-01-01', to: '2026-02-01' });
    expect(byRange.body.data.logs).toHaveLength(2);
  });

  it('does not expose a create, update or delete route for audit entries', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const agent = await signInWithCleanAudit('admin@example.com');
    const log = await createActivityLog();

    const created = await agent.post('/api/v1/admin/activity-logs').send({ action: 'fake.action' });
    expect(created.status).toBe(404);

    const updated = await agent.patch(`/api/v1/admin/activity-logs/${log._id}`).send({ action: 'fake.action' });
    expect(updated.status).toBe(404);

    const deleted = await agent.delete(`/api/v1/admin/activity-logs/${log._id}`);
    expect(deleted.status).toBe(404);

    expect(await ActivityLog.countDocuments({})).toBe(1);
    expect((await ActivityLog.findById(log._id)).action).toBe('doctor.approved');
  });

  it('never returns sensitive metadata', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const agent = await signInWithCleanAudit('admin@example.com');

    // Bypass the schema guard to prove the READ serializer also filters secrets.
    await ActivityLog.collection.insertOne({
      actorId: null,
      actorRole: 'system',
      action: 'legacy.event',
      description: 'A legacy audit entry',
      targetType: 'User',
      targetId: null,
      timestamp: new Date(),
      metadata: {
        token: 'SUPER-SECRET-TOKEN-VALUE',
        password: 'SUPER-SECRET-PASSWORD',
        note: 'This note is safe',
      },
    });

    const res = await agent.get('/api/v1/admin/activity-logs');

    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('SUPER-SECRET-TOKEN-VALUE');
    expect(serialized).not.toContain('SUPER-SECRET-PASSWORD');

    const entry = res.body.data.logs[0];
    expect(entry.metadata).toEqual({ note: 'This note is safe' });
  });
});

describe('Phase 7 - admin profile and notifications', () => {
  it('scopes notifications to the authenticated administrator', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const admin = await createAdmin();
    const otherAdmin = await createAdmin({ email: 'admin.two@example.com', fullName: 'Second Administrator' });
    await createNotification(admin._id, { title: 'Mine' });
    const foreign = await createNotification(otherAdmin._id, { title: 'Theirs' });

    const agent = await signIn('admin@example.com');
    const res = await agent.get('/api/v1/admin/notifications');

    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.notifications[0].title).toBe('Mine');

    // Another administrator's notification is a 404, never a 403 that would
    // confirm the id exists.
    const blocked = await agent.patch(`/api/v1/admin/notifications/${foreign._id}/read`);
    expect(blocked.status).toBe(404);

    const read = await agent.patch(`/api/v1/admin/notifications/${res.body.data.notifications[0].id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.notification.isRead).toBe(true);
  });

  it('accepts only permitted profile fields', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const admin = await createAdmin();
    const agent = await signIn('admin@example.com');

    const ok = await agent
      .patch('/api/v1/admin/profile')
      .send({ fullName: 'Updated Administrator', mobileNumber: '+91 90000 11111' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.fullName).toBe('Updated Administrator');

    const roleAttempt = await agent.patch('/api/v1/admin/profile').send({ role: 'patient' });
    expect(roleAttempt.status).toBe(400);
    expect(roleAttempt.body.code).toBe('PROTECTED_FIELD');

    const emailAttempt = await agent.patch('/api/v1/admin/profile').send({ email: 'new@example.com' });
    expect(emailAttempt.status).toBe(400);
    expect(emailAttempt.body.code).toBe('EMAIL_CHANGE_NOT_SUPPORTED');

    const stored = await User.findById(admin._id);
    expect(stored.role).toBe('admin');
    expect(stored.email).toBe('admin@example.com');
    expect(stored.accountStatus).toBe('active');
  });
});
