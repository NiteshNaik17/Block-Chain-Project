import mongoMemoryServer from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';

const { MongoMemoryServer } = mongoMemoryServer;

/**
 * Phase 4 - administrator doctor-verification workflow.
 *
 * Uses a local in-memory MongoDB instance; no Atlas cluster is contacted.
 */

const TEST_DB_NAME = 'mediconsent_phase4_admin_test';
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
  createUser({ fullName: 'MediConsent Administrator', email: 'admin@example.com', role: 'admin', accountStatus: 'active', ...overrides });

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

/** An agent already signed in as the given account. */
async function signIn(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
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
    console.warn('[admin.test] In-memory MongoDB unavailable:', err.message);
  }
}, 180000);

afterAll(async () => {
  if (mongoAvailable) {
    await User.deleteMany({});
    await ActivityLog.deleteMany({});
    await disconnectDB();
  }
  if (mongoServer) await mongoServer.stop();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  if (!mongoAvailable) return;
  await User.deleteMany({});
  await ActivityLog.deleteMany({});
});

describe('Phase 4 - admin doctor verification', () => {
  it('lists only pending doctor applications without exposing hashes', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    await createPendingDoctor();
    await createUser({
      fullName: 'Dr. Verified',
      email: 'verified@example.com',
      role: 'doctor',
      accountStatus: 'active',
      verificationStatus: 'verified',
      medicalRegistrationNumber: 'MCI-2019-77777',
      specialization: 'Neurology',
      hospitalName: 'Lakeside Clinic',
    });

    const agent = await signIn('admin@example.com');
    const res = await agent.get('/api/v1/admin/doctors/pending');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('rohan.mehta@example.com');
    expect(res.body.data[0].verificationStatus).toBe('pending');
    expect(res.body.counts).toEqual({ pending: 1, verified: 1, rejected: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('approves a pending doctor and activates the account', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');

    const res = await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`);

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('verified');
    expect(res.body.data.accountStatus).toBe('active');
    expect(res.body.data.verifiedAt).toBeTruthy();

    const stored = await User.findById(doctor._id);
    expect(stored.verificationStatus).toBe('verified');
    expect(stored.accountStatus).toBe('active');

    const log = await ActivityLog.findOne({ action: 'doctor.approved' });
    expect(log).toBeTruthy();
    expect(String(log.targetId)).toBe(String(doctor._id));
  });

  it('lets an approved doctor reach the verified-doctor portal', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const adminAgent = await signIn('admin@example.com');
    await adminAgent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`);

    const doctorAgent = await signIn('rohan.mehta@example.com');
    const res = await doctorAgent.get('/api/v1/doctor/access');
    expect(res.status).toBe(200);
  });

  it('requires a rejection reason and stores it', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');

    const missing = await agent.patch(`/api/v1/admin/doctors/${doctor._id}/reject`).send({});
    expect(missing.status).toBe(400);

    const res = await agent
      .patch(`/api/v1/admin/doctors/${doctor._id}/reject`)
      .send({ reason: 'Registration certificate could not be verified' });

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('rejected');
    expect(res.body.data.accountStatus).toBe('rejected');
    expect(res.body.data.verificationReason).toBe('Registration certificate could not be verified');

    const stored = await User.findById(doctor._id);
    expect(stored.verificationStatus).toBe('rejected');
    expect(stored.verificationReason).toBe('Registration certificate could not be verified');

    const log = await ActivityLog.findOne({ action: 'doctor.rejected' });
    expect(log).toBeTruthy();
    expect(log.metadata.reason).toBe('Registration certificate could not be verified');
  });

  it('prevents reprocessing an already-handled application', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const doctor = await createPendingDoctor();
    const agent = await signIn('admin@example.com');

    await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`).expect(200);

    const again = await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('APPLICATION_ALREADY_PROCESSED');

    const rejectAgain = await agent
      .patch(`/api/v1/admin/doctors/${doctor._id}/reject`)
      .send({ reason: 'Trying to reprocess' });
    expect(rejectAgain.status).toBe(409);
    expect(rejectAgain.body.code).toBe('APPLICATION_ALREADY_PROCESSED');
  });

  it('validates doctor identifiers', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createAdmin();
    const agent = await signIn('admin@example.com');

    const invalid = await agent.patch('/api/v1/admin/doctors/not-an-id/approve');
    expect(invalid.status).toBe(400);

    const unknown = await agent.patch('/api/v1/admin/doctors/64b7f0c8f1a2b3c4d5e6f7a8/approve');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('DOCTOR_NOT_FOUND');

    // A patient id is not a doctor application.
    const patient = await createUser({ email: 'patient@example.com' });
    const wrongRole = await agent.patch(`/api/v1/admin/doctors/${patient._id}/approve`);
    expect(wrongRole.status).toBe(404);
  });

  it('blocks non-administrators from approving or rejecting doctors', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const doctor = await createPendingDoctor();
    await createUser({ email: 'patient@example.com' });

    const patientAgent = await signIn('patient@example.com');
    const doctorAgent = await signIn('rohan.mehta@example.com');

    for (const agent of [patientAgent, doctorAgent]) {
      const list = await agent.get('/api/v1/admin/doctors/pending');
      expect(list.status).toBe(403);

      const approve = await agent.patch(`/api/v1/admin/doctors/${doctor._id}/approve`);
      expect(approve.status).toBe(403);

      const reject = await agent
        .patch(`/api/v1/admin/doctors/${doctor._id}/reject`)
        .send({ reason: 'Unauthorised attempt' });
      expect(reject.status).toBe(403);
    }

    const stored = await User.findById(doctor._id);
    expect(stored.verificationStatus).toBe('pending');
  });

  it('requires authentication for the verification queue', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app).get('/api/v1/admin/doctors/pending');
    expect(res.status).toBe(401);
  });
});
