import app from './app.js';
import env from './config/env.js';
import { connectDB, dbName, disconnectDB } from './config/db.js';

let inMemoryMongo = null;

async function connectToDatabase() {
  if (!env.mongoUri) {
    if (env.nodeEnv === 'development') {
      try {
        console.log(
          '[MediConsent] MONGODB_URI not provided. Starting in-memory MongoDB instance for local demonstration...'
        );
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        inMemoryMongo = await MongoMemoryServer.create({ instance: { dbName: env.databaseName } });
        const uri = inMemoryMongo.getUri();
        await connectDB(uri);
        return;
      } catch (memErr) {
        console.warn('[MediConsent] Could not start in-memory MongoDB:', memErr.message);
      }
    }

    console.warn(
      '[MediConsent] MONGODB_URI is not set. Starting API without database connectivity.'
    );
    return;
  }

  try {
    await connectDB();
  } catch (err) {
    // Honest fallback: the API still serves /api/health so the degraded state is
    // observable, but every data-backed route will fail until the database is
    // reachable again.
    console.error('[MediConsent] Starting API without database connectivity:', err.message);
  }
}

async function ensureDevAdmin() {
  if (env.nodeEnv === 'development') {
    try {
      const { default: User } = await import('./models/User.js');
      const email = 'admin@mediconsent.local';
      const existing = await User.findOne({ email });
      if (!existing) {
        const { hashPassword } = await import('./utils/password.js');
        await User.create({
          fullName: 'System Administrator',
          email,
          mobileNumber: '+91 98765 00000',
          passwordHash: await hashPassword('AdminPassword123!'),
          role: 'admin',
          accountStatus: 'active',
        });
        console.log('[MediConsent] Default development administrator account ready: admin@mediconsent.local');
      }
    } catch {
      // Ignored if db not connected
    }
  }
}

async function start() {
  await connectToDatabase();
  await ensureDevAdmin();

  const server = app.listen(env.port, () => {
    console.log(
      `[MediConsent] API listening on http://localhost:${env.port} (${env.nodeEnv}) - db "${dbName()}"`
    );
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[MediConsent] ${signal} received, shutting down.`);

    server.close(async () => {
      try {
        await disconnectDB();
        if (inMemoryMongo) {
          await inMemoryMongo.stop();
        }
      } catch (err) {
        console.error('[MediConsent] Error while closing MongoDB connection:', err.message);
      } finally {
        process.exit(0);
      }
    });

    // Safety net: never hang forever waiting for open sockets to drain.
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
