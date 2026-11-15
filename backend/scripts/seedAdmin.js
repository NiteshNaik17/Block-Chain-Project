/**
 * One-time administrator provisioning script.
 *
 * There is NO public administrator registration. Run this manually after
 * configuring the environment:
 *
 *   npm run seed:admin
 *
 * It reads ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD from the environment,
 * hashes the password with bcrypt, and creates a single admin account only if
 * no account already uses that email address. The password is never printed and
 * never hardcoded.
 */
import env from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';

async function seedAdmin() {
  const email = String(env.adminEmail || '').trim().toLowerCase();
  const password = env.adminPassword || '';
  const fullName = String(env.adminName || '').trim() || 'MediConsent Administrator';

  if (!env.mongoUri) {
    console.error('[seedAdmin] MONGODB_URI is not configured - nothing was created.');
    process.exitCode = 1;
    return;
  }
  if (!email || !password) {
    console.error('[seedAdmin] Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment first.');
    process.exitCode = 1;
    return;
  }

  await connectDB();

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(
      `[seedAdmin] An account already exists for ${email} (role: ${existing.role}). Nothing to do.`
    );
    return;
  }

  const passwordHash = await hashPassword(password);

  const admin = await User.create({
    fullName,
    email,
    mobileNumber: env.adminMobile,
    passwordHash,
    role: 'admin',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
  });

  console.log(`[seedAdmin] Administrator account created for ${admin.email}.`);
  console.log('[seedAdmin] The password was hashed and is not displayed or stored in plain text.');
}

seedAdmin()
  .catch((error) => {
    console.error('[seedAdmin] Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB().catch(() => {});
  });
