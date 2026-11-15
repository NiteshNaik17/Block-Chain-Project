import mongoMemoryServer from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../app.js';
import { AUTH_COOKIE_NAME } from '../config/authCookie.js';
import { connectDB, disconnectDB } from '../config/db.js';
import ActivityLog from '../models/ActivityLog.js';
import User from '../models/User.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const { MongoMemoryServer } = mongoMemoryServer;

/**
 * Phase 4 - authentication & role-based access control.
 *
 * Runs against a local in-memory MongoDB instance (no Atlas credentials, no
 * data leaves the machine). A real Atlas cluster is NOT contacted here.
 */

const TEST_DB_NAME = 'mediconsent_phase4_auth_test';
const PLAIN_PASSWORD = 'PatientPass123';
const DOCTOR_PASSWORD = 'DoctorPass123';

let mongoServer = null;
let mongoAvailable = false;
let startupError = null;

const patientPayload = (overrides = {}) => ({
  fullName: 'Ananya Sharma',
  email: 'ananya.sharma@example.com',
  mobileNumber: '+91 98200 41235',
  password: PLAIN_PASSWORD,
  confirmPassword: PLAIN_PASSWORD,
  ...overrides,
});

const doctorPayload = (overrides = {}) => ({
  fullName: 'Dr. Rohan Mehta',
  email: 'rohan.mehta@example.com',
  mobileNumber: '+91 98195 77342',
  medicalRegistrationNumber: 'MCI-2016-44821',
  specialization: 'Cardiology',
  hospitalName: 'Sunrise Multispeciality Hospital',
  password: DOCTOR_PASSWORD,
  confirmPassword: DOCTOR_PASSWORD,
  ...overrides,
});

/** Return the raw Set-Cookie string for the session cookie, if present. */
function sessionCookie(res) {
  const cookies = res.headers['set-cookie'] ?? [];
  return cookies.find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`)) ?? null;
}

async function createUser(overrides = {}) {
  return User.create({
    fullName: 'Existing User',
    email: 'existing@example.com',
    mobileNumber: '+91 90000 00000',
    passwordHash: await hashPassword(PLAIN_PASSWORD),
    role: 'patient',
    ...overrides,
  });
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
    console.warn('[auth.test] In-memory MongoDB unavailable:', err.message);
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

describe('Phase 4 - patient registration', () => {
  it('registers a patient, signs them in and returns a safe user', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app).post('/api/v1/auth/register/patient').send(patientPayload());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('patient');
    expect(res.body.user.accountStatus).toBe('active');
    expect(res.body.user.verificationStatus).toBe('not_applicable');
    expect(res.body.user.passwordHash).toBeUndefined();

    // Registration signs the user in via an HttpOnly cookie (no token in body).
    expect(sessionCookie(res)).toBeTruthy();
    expect(res.body.token).toBeUndefined();

    const stored = await User.findOne({ email: 'ananya.sharma@example.com' });
    expect(stored).toBeTruthy();
  });

  it('rejects a duplicate patient email with 409', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/patient').send(patientPayload());
    const res = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patientPayload({ mobileNumber: '+91 90000 11111' }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
  });

  it('stores a bcrypt hash, never the plain-text password', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app).post('/api/v1/auth/register/patient').send(patientPayload());

    const stored = await User.findOne({ email: 'ananya.sharma@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).toBeTruthy();
    expect(stored.passwordHash).not.toBe(PLAIN_PASSWORD);
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
    expect(await verifyPassword(PLAIN_PASSWORD, stored.passwordHash)).toBe(true);

    // The plain password must never appear in the stored document or response.
    expect(JSON.stringify(stored.toObject())).not.toContain(PLAIN_PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain(PLAIN_PASSWORD);
  });

  it('validates required fields, email format, password policy and confirmation', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const missing = await request(app).post('/api/v1/auth/register/patient').send({});
    expect(missing.status).toBe(400);
    expect(Array.isArray(missing.body.errors)).toBe(true);

    const badEmail = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patientPayload({ email: 'not-an-email' }));
    expect(badEmail.status).toBe(400);

    const badMobile = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patientPayload({ mobileNumber: 'abc' }));
    expect(badMobile.status).toBe(400);

    const weakPassword = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patientPayload({ password: 'weak', confirmPassword: 'weak' }));
    expect(weakPassword.status).toBe(400);

    const mismatch = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patientPayload({ confirmPassword: 'DifferentPass123' }));
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.errors.some((issue) => issue.field === 'confirmPassword')).toBe(true);

    expect(await User.countDocuments({})).toBe(0);
  });

  it('ignores role and status supplied by the caller', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app)
      .post('/api/v1/auth/register/patient')
      .send(patientPayload({ role: 'admin', accountStatus: 'active', verificationStatus: 'verified' }));

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('patient');

    const stored = await User.findOne({ email: 'ananya.sharma@example.com' });
    expect(stored.role).toBe('patient');
    expect(stored.verificationStatus).toBe('not_applicable');
  });
});

describe('Phase 4 - doctor registration', () => {
  it('registers a doctor as pending and unverified', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app).post('/api/v1/auth/register/doctor').send(doctorPayload());

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('doctor');
    expect(res.body.user.accountStatus).toBe('pending');
    expect(res.body.user.verificationStatus).toBe('pending');
    expect(res.body.user.medicalRegistrationNumber).toBe('MCI-2016-44821');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate medical registration number with 409', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/doctor').send(doctorPayload());
    const res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctorPayload({ email: 'other.doctor@example.com', mobileNumber: '+91 98195 11111' }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REGISTRATION_NUMBER_IN_USE');
  });

  it('rejects a duplicate doctor email with 409', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/doctor').send(doctorPayload());
    const res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctorPayload({ medicalRegistrationNumber: 'MCI-2016-99999', mobileNumber: '+91 98195 22222' }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
  });

  it('does not let a doctor self-approve or self-verify', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctorPayload({ accountStatus: 'active', verificationStatus: 'verified', isVerified: true }));

    expect(res.status).toBe(201);
    expect(res.body.user.accountStatus).toBe('pending');
    expect(res.body.user.verificationStatus).toBe('pending');
  });

  it('never accepts or stores a certificate file path from the request', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app)
      .post('/api/v1/auth/register/doctor')
      .send(doctorPayload({ certificateFileReference: '../../etc/passwd' }));

    expect(res.status).toBe(201);
    expect(res.body.user.certificateFileReference).toBeNull();

    const stored = await User.findOne({ email: 'rohan.mehta@example.com' });
    expect(stored.certificateFileReference).toBeNull();
  });
});

describe('Phase 4 - login, logout and session', () => {
  it('signs in with valid credentials and sets an HttpOnly cookie', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/patient').send(patientPayload());
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ananya.sharma@example.com', password: PLAIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('ananya.sharma@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = sessionCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toMatch(/Max-Age=\d+/);
    // Local development runs over plain HTTP, so the cookie must not be Secure.
    expect(cookie).not.toContain('Secure');
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a wrong password with a generic 401', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/patient').send(patientPayload());
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ananya.sharma@example.com', password: 'WrongPass123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('does not reveal whether an email belongs to an account', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/patient').send(patientPayload());

    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: PLAIN_PASSWORD });
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ananya.sharma@example.com', password: 'WrongPass123' });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body.message).toBe(wrongPassword.body.message);
    expect(unknown.body.code).toBe(wrongPassword.body.code);
  });

  it('rejects suspended and rejected accounts', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createUser({ email: 'suspended@example.com', accountStatus: 'suspended' });
    await createUser({ email: 'rejected@example.com', accountStatus: 'rejected' });

    const suspended = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'suspended@example.com', password: PLAIN_PASSWORD });
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('ACCOUNT_SUSPENDED');

    const rejected = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rejected@example.com', password: PLAIN_PASSWORD });
    expect(rejected.status).toBe(403);
    expect(rejected.body.code).toBe('ACCOUNT_REJECTED');
  });

  it('allows a pending doctor to sign in so the status page can be shown', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/doctor').send(doctorPayload());
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rohan.mehta@example.com', password: DOCTOR_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.verificationStatus).toBe('pending');
    expect(sessionCookie(res)).toBeTruthy();
  });

  it('clears the authentication cookie on logout', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cookie = sessionCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain(`${AUTH_COOKIE_NAME}=;`);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('returns the current user from /auth/me and 401 without a valid session', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register/patient').send(patientPayload());

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ananya.sharma@example.com');
    expect(me.body.user.role).toBe('patient');
    expect(me.body.user.accountStatus).toBe('active');
    expect(me.body.user.passwordHash).toBeUndefined();

    const anonymous = await request(app).get('/api/v1/auth/me');
    expect(anonymous.status).toBe(401);

    const malformed = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${AUTH_COOKIE_NAME}=not-a-real-token`);
    expect(malformed.status).toBe(401);

    // A token signed with the wrong secret must also be rejected.
    const { default: jsonwebtoken } = await import('jsonwebtoken');
    const forged = jsonwebtoken.sign({ sub: '000000000000000000000000', role: 'admin' }, 'wrong-secret');
    const forgedRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${AUTH_COOKIE_NAME}=${forged}`);
    expect(forgedRes.status).toBe(401);
  });

  it('records sign-in activity without storing credentials', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await request(app).post('/api/v1/auth/register/patient').send(patientPayload());
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ananya.sharma@example.com', password: PLAIN_PASSWORD });

    const logs = await ActivityLog.find({ action: 'auth.login' });
    expect(logs.length).toBeGreaterThan(0);

    const serialised = JSON.stringify(logs.map((log) => log.toObject()));
    expect(serialised).not.toContain(PLAIN_PASSWORD);
    expect(serialised).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
});

describe('Phase 4 - role-based access control', () => {
  it('rejects protected routes without authentication (401)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    for (const path of ['/api/v1/auth/me', '/api/v1/patient/access', '/api/v1/doctor/access', '/api/v1/admin/access']) {
      const res = await request(app).get(path);
      expect(res.status, `${path} must require authentication`).toBe(401);
    }
  });

  it('blocks a patient from doctor and admin areas (403)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register/patient').send(patientPayload());

    const doctorArea = await agent.get('/api/v1/doctor/access');
    expect(doctorArea.status).toBe(403);
    expect(doctorArea.body.code).toBe('ROLE_NOT_PERMITTED');

    const adminArea = await agent.get('/api/v1/admin/access');
    expect(adminArea.status).toBe(403);
    expect(adminArea.body.code).toBe('ROLE_NOT_PERMITTED');

    // A patient may still use their own portal.
    const ownArea = await agent.get('/api/v1/patient/access');
    expect(ownArea.status).toBe(200);
  });

  it('blocks a verified doctor from admin areas (403)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createUser({
      email: 'verified.doctor@example.com',
      role: 'doctor',
      accountStatus: 'active',
      verificationStatus: 'verified',
      medicalRegistrationNumber: 'MCI-2020-00001',
      specialization: 'Cardiology',
      hospitalName: 'Sunrise Multispeciality Hospital',
    });

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: 'verified.doctor@example.com', password: PLAIN_PASSWORD });

    const adminArea = await agent.get('/api/v1/admin/access');
    expect(adminArea.status).toBe(403);

    const doctorArea = await agent.get('/api/v1/doctor/access');
    expect(doctorArea.status).toBe(200);
  });

  it('blocks a pending doctor from the verified-doctor portal', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register/doctor').send(doctorPayload());

    const res = await agent.get('/api/v1/doctor/access');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DOCTOR_PENDING_VERIFICATION');
    expect(res.body.verificationStatus).toBe('pending');
  });

  it('blocks a rejected doctor from the verified-doctor portal', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createUser({
      email: 'rejected.doctor@example.com',
      role: 'doctor',
      accountStatus: 'active',
      verificationStatus: 'rejected',
      medicalRegistrationNumber: 'MCI-2020-00002',
      specialization: 'Neurology',
      hospitalName: 'Lakeside Clinic',
    });

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: 'rejected.doctor@example.com', password: PLAIN_PASSWORD });

    const res = await agent.get('/api/v1/doctor/access');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DOCTOR_PENDING_VERIFICATION');
  });

  it('allows an administrator into the admin area', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createUser({ email: 'admin@example.com', role: 'admin', accountStatus: 'active' });

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: 'admin@example.com', password: PLAIN_PASSWORD });

    const res = await agent.get('/api/v1/admin/access');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('does not let an administrator read patient records', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await createUser({ email: 'admin@example.com', role: 'admin', accountStatus: 'active' });

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: 'admin@example.com', password: PLAIN_PASSWORD });

    // The patient portal must stay closed to administrators.
    const res = await agent.get('/api/v1/patient/access');
    expect(res.status).toBe(403);
  });
});

describe('Phase 4 - admin provisioning', () => {
  it('does not expose public administrator registration', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const payload = {
      fullName: 'Fake Admin',
      email: 'fake.admin@example.com',
      mobileNumber: '+91 90000 00000',
      password: PLAIN_PASSWORD,
      confirmPassword: PLAIN_PASSWORD,
      role: 'admin',
    };

    // No admin-registration route is mounted on the public auth router.
    for (const path of ['/api/v1/auth/register/admin', '/api/v1/auth/register']) {
      const res = await request(app).post(path).send(payload);
      expect(res.status, `${path} must not exist`).toBe(404);
    }

    // The admin router itself is entirely behind authentication + authorisation,
    // so even an unknown admin sub-path can never create an account.
    const adminRegister = await request(app).post('/api/v1/admin/register').send(payload);
    expect(adminRegister.status).toBeGreaterThanOrEqual(401);

    expect(await User.countDocuments({ role: 'admin' })).toBe(0);
  });
});
