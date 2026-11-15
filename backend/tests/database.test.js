import mongoose from 'mongoose';
import mongoMemoryServer from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { connectDB, dbName, dbState, disconnectDB, isDbConnected } from '../config/db.js';
import User from '../models/User.js';
import MedicalRecord from '../models/MedicalRecord.js';

const { MongoMemoryServer } = mongoMemoryServer;

/**
 * Live database integration tests.
 *
 * These exercise the real connection module and real MongoDB behaviour, using a
 * local in-memory MongoDB instance so no Atlas credentials are required and no
 * data leaves the machine. A real Atlas cluster is NOT contacted here.
 */

const TEST_DB_NAME = 'mediconsent_phase3_test';

let mongoServer = null;
let mongoAvailable = false;
let startupError = null;

const patient = (overrides = {}) => ({
  fullName: 'Ananya Sharma',
  email: 'ananya.sharma@example.com',
  mobileNumber: '+91 98200 41235',
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
  role: 'patient',
  ...overrides,
});

const doctor = (overrides = {}) => ({
  fullName: 'Dr. Rohan Mehta',
  email: 'rohan.mehta@example.com',
  mobileNumber: '+91 98195 77342',
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
  role: 'doctor',
  medicalRegistrationNumber: 'MCI-2016-44821',
  specialization: 'Cardiology',
  hospitalName: 'Sunrise Multispeciality Hospital',
  ...overrides,
});

beforeAll(async () => {
  // The 5xx logging from expected failures is not useful in test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: TEST_DB_NAME } });
    await connectDB(mongoServer.getUri(), { dbName: TEST_DB_NAME, serverSelectionTimeoutMS: 10000 });
    mongoAvailable = true;
  } catch (err) {
    startupError = err;
    console.warn('[database.test] In-memory MongoDB unavailable:', err.message);
  }
}, 180000);

afterAll(async () => {
  if (mongoAvailable) {
    await User.deleteMany({});
    await MedicalRecord.deleteMany({});
    await User.collection.dropIndexes().catch(() => {});
    await disconnectDB();
  }
  if (mongoServer) await mongoServer.stop();
  vi.restoreAllMocks();
});

describe('Phase 3 - MongoDB connection module', () => {
  it('connects and reports the live state', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    expect(isDbConnected()).toBe(true);
    expect(dbState()).toBe('connected');
    expect(dbName()).toBe(TEST_DB_NAME);
  });

  it('does not open a second connection when connectDB is called again', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const before = mongoose.connection;
    await connectDB(mongoServer.getUri(), { dbName: TEST_DB_NAME });

    expect(mongoose.connection).toBe(before);
    expect(mongoose.connection.readyState).toBe(1);
  });

  it('selects the database named by the DATABASE_NAME option', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    // dbName() reflects what the driver actually selected, not just the default.
    expect(dbName()).toBe(TEST_DB_NAME);
    expect(TEST_DB_NAME).not.toBe('mediconsent');
  });
});

describe('Phase 3 - live model behaviour', () => {
  it('builds the User indexes, including the unique email index', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await User.init();
    const indexes = await User.collection.indexes();
    const emailIndex = indexes.find((index) => index.key.email === 1);

    expect(emailIndex).toBeDefined();
    expect(emailIndex.unique).toBe(true);

    const registrationIndex = indexes.find((index) => index.key.medicalRegistrationNumber === 1);
    expect(registrationIndex).toBeDefined();
    expect(registrationIndex.unique).toBe(true);
  });

  it('persists a valid patient and omits passwordHash in the returned JSON', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const saved = await User.create(patient({ email: 'patient.persist@example.com' }));

    expect(saved._id).toBeDefined();
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.toJSON()).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email at the database level (E11000)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await User.create(patient({ email: 'duplicate@example.com' }));

    await expect(
      User.create(patient({ email: 'duplicate@example.com', mobileNumber: '+91 90000 00000' }))
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows many patients with a null medical registration number (partial index)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const first = await User.create(patient({ email: 'partial.one@example.com' }));
    const second = await User.create(patient({ email: 'partial.two@example.com' }));

    expect(first.medicalRegistrationNumber).toBeNull();
    expect(second.medicalRegistrationNumber).toBeNull();
  });

  it('rejects a duplicate medical registration number for doctors', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await User.create(doctor({ email: 'doctor.one@example.com' }));

    await expect(
      User.create(
        doctor({
          email: 'doctor.two@example.com',
          mobileNumber: '+91 98195 11111',
          medicalRegistrationNumber: 'MCI-2016-44821',
        })
      )
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects an invalid enum value on save (validation still runs with a live DB)', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const bad = new User(patient({ email: 'bad.role@example.com', role: 'superuser' }));
    await expect(bad.save()).rejects.toThrow(/validation/i);
  });

  it('stores a medical record that only references storage metadata, never contents', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    const owner = await User.create(patient({ email: 'records.owner@example.com' }));
    const record = await MedicalRecord.create({
      patientId: owner._id,
      recordTitle: 'Complete Blood Count',
      category: 'Laboratory Report',
      hospitalName: 'Lakeside Diagnostic Centre',
      reportDate: new Date('2026-03-11'),
      fileReference: 'vault/2026/cbc-report.enc',
      originalFileName: 'cbc-report.pdf',
      mimeType: 'application/pdf',
      fileSize: 482113,
    });

    const stored = await MedicalRecord.findById(record._id).lean();
    expect(stored.encryptionStatus).toBe('pending');
    expect(stored.recordStatus).toBe('active');
    // No document bytes are stored in MongoDB - only metadata.
    expect(Object.keys(stored)).not.toContain('content');
    expect(Object.keys(stored)).not.toContain('fileData');
  });
});

describe('Phase 3 - safe shutdown', () => {
  it('disconnects cleanly and reports the disconnected state', async (ctx) => {
    if (!mongoAvailable) ctx.skip(`In-memory MongoDB unavailable: ${startupError?.message}`);

    await disconnectDB();

    expect(isDbConnected()).toBe(false);
    expect(dbState()).toBe('disconnected');

    // Reconnect so any later test in this file still has a usable connection.
    await connectDB(mongoServer.getUri(), { dbName: TEST_DB_NAME });
    expect(dbState()).toBe('connected');
  });
});
