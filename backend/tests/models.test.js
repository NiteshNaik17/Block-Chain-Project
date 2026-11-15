import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import User from '../models/User.js';
import MedicalRecord from '../models/MedicalRecord.js';
import AccessRequest from '../models/AccessRequest.js';
import Consent from '../models/Consent.js';
import AccessLog from '../models/AccessLog.js';
import ActivityLog from '../models/ActivityLog.js';
import Notification from '../models/Notification.js';

/**
 * Model-level tests. These run WITHOUT a database connection: Mongoose document
 * validation and schema/index introspection are both purely local operations.
 * Real insert / unique-index behaviour is covered in database.test.js.
 */

const objectId = () => new mongoose.Types.ObjectId();

/** Returns the ValidationError#errors map, or null when the document is valid. */
async function validationErrors(doc) {
  try {
    await doc.validate();
    return null;
  } catch (err) {
    return err.errors;
  }
}

const SHA256_HEX = 'a'.repeat(64);

const validPatient = () => ({
  fullName: 'Ananya Sharma',
  email: 'ananya.sharma@example.com',
  mobileNumber: '+91 98200 41235',
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
  role: 'patient',
});

const validDoctor = () => ({
  ...validPatient(),
  email: 'rohan.mehta@example.com',
  role: 'doctor',
  medicalRegistrationNumber: 'MCI-2016-44821',
  specialization: 'Cardiology',
  hospitalName: 'Sunrise Multispeciality Hospital',
});

describe('Phase 3 - all seven models load', () => {
  const models = [
    ['User', User, 'users'],
    ['MedicalRecord', MedicalRecord, 'medicalrecords'],
    ['AccessRequest', AccessRequest, 'accessrequests'],
    ['Consent', Consent, 'consents'],
    ['AccessLog', AccessLog, 'accesslogs'],
    ['ActivityLog', ActivityLog, 'activitylogs'],
    ['Notification', Notification, 'notifications'],
  ];

  it.each(models)('%s registers with Mongoose', (name, model, collection) => {
    expect(model).toBeDefined();
    expect(model.modelName).toBe(name);
    expect(model.collection.name).toBe(collection);
    expect(model.schema).toBeInstanceOf(mongoose.Schema);
  });

  it('registers exactly seven models in this session', () => {
    expect(mongoose.modelNames().sort()).toEqual(
      [
        'AccessLog',
        'AccessRequest',
        'ActivityLog',
        'Consent',
        'MedicalRecord',
        'Notification',
        'User',
      ].sort()
    );
  });
});

describe('User model', () => {
  it('accepts a valid patient document', async () => {
    await expect(new User(validPatient()).validate()).resolves.toBeUndefined();
  });

  it('accepts a valid doctor document', async () => {
    await expect(new User(validDoctor()).validate()).resolves.toBeUndefined();
  });

  it('rejects a document missing required fields', async () => {
    const errors = await validationErrors(new User({}));

    expect(errors).not.toBeNull();
    expect(Object.keys(errors).sort()).toEqual(
      ['email', 'fullName', 'mobileNumber', 'passwordHash'].sort()
    );
  });

  it('rejects an invalid email format', async () => {
    const errors = await validationErrors(new User({ ...validPatient(), email: 'not-an-email' }));
    expect(errors.email.message).toBe('Email address is not valid');
  });

  it('rejects an invalid mobile number', async () => {
    const errors = await validationErrors(new User({ ...validPatient(), mobileNumber: 'abc' }));
    expect(errors.mobileNumber).toMatchObject({ path: 'mobileNumber' });
  });

  it('rejects a role outside the allowed enum', async () => {
    const errors = await validationErrors(new User({ ...validPatient(), role: 'superuser' }));
    expect(errors.role).toMatchObject({ path: 'role' });
  });

  it('rejects an account status outside the allowed enum', async () => {
    const errors = await validationErrors(
      new User({ ...validPatient(), accountStatus: 'unknown' })
    );
    expect(errors.accountStatus).toMatchObject({ path: 'accountStatus' });
  });

  it('rejects invalid gender and blood group values', async () => {
    const errors = await validationErrors(
      new User({ ...validPatient(), gender: 'robot', bloodGroup: 'Z+' })
    );
    expect(errors).toHaveProperty('gender');
    expect(errors).toHaveProperty('bloodGroup');
  });

  it('accepts null gender and blood group (both optional)', async () => {
    await expect(
      new User({ ...validPatient(), gender: null, bloodGroup: null }).validate()
    ).resolves.toBeUndefined();
  });

  it('rejects a malformed wallet address but accepts a valid one', async () => {
    const bad = await validationErrors(new User({ ...validPatient(), walletAddress: '0x123' }));
    expect(bad).toHaveProperty('walletAddress');

    const good = await validationErrors(
      new User({ ...validPatient(), walletAddress: '0x1234567890abcdef1234567890abcdef12345678' })
    );
    expect(good).toBeNull();
  });

  it('requires doctor-only fields when the role is doctor', async () => {
    const errors = await validationErrors(
      new User({ ...validPatient(), role: 'doctor' })
    );

    expect(errors).toHaveProperty('medicalRegistrationNumber');
    expect(errors).toHaveProperty('specialization');
    expect(errors).toHaveProperty('hospitalName');
  });

  it('does not require doctor-only fields for patients', async () => {
    await expect(new User(validPatient()).validate()).resolves.toBeUndefined();
  });

  it('applies role-aware defaults for status fields', () => {
    expect(new User(validPatient()).accountStatus).toBe('active');
    expect(new User(validPatient()).verificationStatus).toBe('not_applicable');
    expect(new User(validDoctor()).accountStatus).toBe('pending');
    expect(new User(validDoctor()).verificationStatus).toBe('pending');
  });

  it('never exposes passwordHash through toJSON', () => {
    const doc = new User({ ...validPatient(), passwordHash: '$2b$10$topsecret' });
    const json = doc.toJSON();

    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('__v');
    expect(json.email).toBe('ananya.sharma@example.com');
  });

  it('declares a unique index on email', () => {
    const emailIndex = User.schema
      .indexes()
      .find(([fields]) => fields.email === 1 && Object.keys(fields).length === 1);

    expect(emailIndex).toBeDefined();
    expect(emailIndex[1]).toMatchObject({ unique: true });
  });

  it('declares a partial unique index on the medical registration number', () => {
    const index = User.schema
      .indexes()
      .find(([fields]) => fields.medicalRegistrationNumber === 1);

    expect(index).toBeDefined();
    expect(index[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { medicalRegistrationNumber: { $type: 'string' } },
    });
  });
});

describe('MedicalRecord model', () => {
  const validRecord = () => ({
    patientId: objectId(),
    recordTitle: 'Complete Blood Count',
    category: 'Laboratory Report',
    hospitalName: 'Lakeside Diagnostic Centre',
    doctorName: 'Dr. Kavita Iyer',
    reportDate: new Date('2026-03-11'),
    description: 'Routine annual screening panel.',
    fileReference: 'vault/2026/cbc-report.enc',
    originalFileName: 'cbc-report.pdf',
    mimeType: 'application/pdf',
    fileSize: 482113,
    integrityHash: SHA256_HEX,
    encryptionStatus: 'encrypted',
    recordStatus: 'active',
  });

  it('accepts a valid record', async () => {
    await expect(new MedicalRecord(validRecord()).validate()).resolves.toBeUndefined();
  });

  it('rejects a category outside the supported list', async () => {
    const errors = await validationErrors(
      new MedicalRecord({ ...validRecord(), category: 'Dental Notes' })
    );
    expect(errors.category).toMatchObject({ path: 'category' });
  });

  it('rejects a record missing required storage metadata', async () => {
    const errors = await validationErrors(new MedicalRecord({ patientId: objectId() }));

    expect(Object.keys(errors).sort()).toEqual(
      [
        'category',
        'fileReference',
        'fileSize',
        'hospitalName',
        'mimeType',
        'originalFileName',
        'recordTitle',
        'reportDate',
      ].sort()
    );
  });

  it('rejects out-of-range file sizes', async () => {
    const negative = await validationErrors(new MedicalRecord({ ...validRecord(), fileSize: -1 }));
    expect(negative).toHaveProperty('fileSize');

    const tooBig = await validationErrors(
      new MedicalRecord({ ...validRecord(), fileSize: 51 * 1024 * 1024 })
    );
    expect(tooBig).toHaveProperty('fileSize');
  });

  it('validates the optional SHA-256 integrity hash', async () => {
    const bad = await validationErrors(
      new MedicalRecord({ ...validRecord(), integrityHash: 'not-a-hash' })
    );
    expect(bad).toHaveProperty('integrityHash');

    const absent = await validationErrors(
      new MedicalRecord({ ...validRecord(), integrityHash: null })
    );
    expect(absent).toBeNull();
  });

  it('rejects invalid encryption and record statuses', async () => {
    const errors = await validationErrors(
      new MedicalRecord({ ...validRecord(), encryptionStatus: 'plain', recordStatus: 'maybe' })
    );
    expect(errors).toHaveProperty('encryptionStatus');
    expect(errors).toHaveProperty('recordStatus');
  });
});

describe('AccessRequest model', () => {
  const validRequest = () => ({
    patientId: objectId(),
    doctorId: objectId(),
    requestedRecords: [objectId()],
    purpose: 'Pre-surgical cardiac evaluation.',
    requestedDuration: 30,
  });

  it('accepts a valid request and defaults to pending', async () => {
    const doc = new AccessRequest(validRequest());
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.status).toBe('pending');
  });

  it('rejects an empty requestedRecords array', async () => {
    const errors = await validationErrors(
      new AccessRequest({ ...validRequest(), requestedRecords: [] })
    );
    expect(errors).toHaveProperty('requestedRecords');
  });

  it('rejects a requested duration outside 1-365 days', async () => {
    const zero = await validationErrors(
      new AccessRequest({ ...validRequest(), requestedDuration: 0 })
    );
    expect(zero).toHaveProperty('requestedDuration');

    const tooLong = await validationErrors(
      new AccessRequest({ ...validRequest(), requestedDuration: 400 })
    );
    expect(tooLong).toHaveProperty('requestedDuration');
  });

  it('rejects an unsupported status', async () => {
    const errors = await validationErrors(
      new AccessRequest({ ...validRequest(), status: 'expired' })
    );
    expect(errors).toHaveProperty('status');
  });

  it('requires a purpose', async () => {
    const errors = await validationErrors(
      new AccessRequest({ ...validRequest(), purpose: '' })
    );
    expect(errors).toHaveProperty('purpose');
  });
});

describe('Consent model', () => {
  const validConsent = () => ({
    patientId: objectId(),
    doctorId: objectId(),
    authorizedRecords: [objectId()],
    purpose: 'Post-operative follow-up review.',
    grantedAt: new Date('2026-03-01T00:00:00Z'),
    expiresAt: new Date('2026-04-01T00:00:00Z'),
  });

  it('accepts a valid consent and defaults to active', async () => {
    const doc = new Consent(validConsent());
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.status).toBe('active');
  });

  it('rejects an expiry that is not after the grant date', async () => {
    const errors = await validationErrors(
      new Consent({
        ...validConsent(),
        grantedAt: new Date('2026-03-01T00:00:00Z'),
        expiresAt: new Date('2026-02-01T00:00:00Z'),
      })
    );
    expect(errors).toHaveProperty('expiresAt');
  });

  it('rejects an unsupported status', async () => {
    const errors = await validationErrors(new Consent({ ...validConsent(), status: 'pending' }));
    expect(errors).toHaveProperty('status');
  });

  it('validates the optional blockchain transaction hash', async () => {
    const bad = await validationErrors(
      new Consent({ ...validConsent(), transactionHash: '0xdeadbeef' })
    );
    expect(bad).toHaveProperty('transactionHash');

    const good = await validationErrors(
      new Consent({ ...validConsent(), transactionHash: `0x${'b'.repeat(64)}` })
    );
    expect(good).toBeNull();
  });

  it('rejects an empty authorizedRecords array', async () => {
    const errors = await validationErrors(new Consent({ ...validConsent(), authorizedRecords: [] }));
    expect(errors).toHaveProperty('authorizedRecords');
  });
});

describe('AccessLog model', () => {
  const validLog = () => ({
    patientId: objectId(),
    doctorId: objectId(),
    medicalRecordId: objectId(),
    accessResult: 'granted',
    ipAddress: '203.0.113.24',
  });

  it('accepts a valid log and defaults accessedAt', async () => {
    const doc = new AccessLog(validLog());
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.accessedAt).toBeInstanceOf(Date);
  });

  it('rejects an unsupported access result', async () => {
    const errors = await validationErrors(
      new AccessLog({ ...validLog(), accessResult: 'maybe' })
    );
    expect(errors).toHaveProperty('accessResult');
  });

  it('requires the medical record reference', async () => {
    const errors = await validationErrors(
      new AccessLog({ ...validLog(), medicalRecordId: undefined })
    );
    expect(errors).toHaveProperty('medicalRecordId');
  });
});

describe('ActivityLog model', () => {
  const validActivity = () => ({
    actorRole: 'patient',
    action: 'CONSENT_GRANTED',
    description: 'Patient approved a consent request.',
    targetType: 'Consent',
    targetId: objectId(),
  });

  it('accepts a valid activity entry', async () => {
    await expect(new ActivityLog(validActivity()).validate()).resolves.toBeUndefined();
  });

  it('rejects an unsupported actor role', async () => {
    const errors = await validationErrors(
      new ActivityLog({ ...validActivity(), actorRole: 'hacker' })
    );
    expect(errors).toHaveProperty('actorRole');
  });

  it('requires action, description and target type', async () => {
    const errors = await validationErrors(new ActivityLog({ actorRole: 'system' }));

    expect(errors).toHaveProperty('action');
    expect(errors).toHaveProperty('description');
    expect(errors).toHaveProperty('targetType');
  });

  it('refuses metadata containing credentials or secrets', async () => {
    const leaked = await validationErrors(
      new ActivityLog({
        ...validActivity(),
        metadata: { nested: { password: 'hunter2' } },
      })
    );
    expect(leaked).toHaveProperty('metadata');

    const tokenLeak = await validationErrors(
      new ActivityLog({ ...validActivity(), metadata: { accessToken: 'xyz' } })
    );
    expect(tokenLeak).toHaveProperty('metadata');

    const safe = await validationErrors(
      new ActivityLog({ ...validActivity(), metadata: { recordCount: 3, source: 'web' } })
    );
    expect(safe).toBeNull();
  });
});

describe('Notification model', () => {
  const validNotification = () => ({
    recipientId: objectId(),
    title: 'New consent request',
    message: 'Dr. Rohan Mehta requested access to two of your records.',
    notificationType: 'consent_request',
  });

  it('accepts a valid notification and defaults isRead to false', async () => {
    const doc = new Notification(validNotification());
    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.isRead).toBe(false);
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an unsupported notification type', async () => {
    const errors = await validationErrors(
      new Notification({ ...validNotification(), notificationType: 'promo' })
    );
    expect(errors).toHaveProperty('notificationType');
  });

  it('requires a recipient, title and message', async () => {
    const errors = await validationErrors(new Notification({}));

    expect(errors).toHaveProperty('recipientId');
    expect(errors).toHaveProperty('title');
    expect(errors).toHaveProperty('message');
  });
});
