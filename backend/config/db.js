import dns from 'dns';
import mongoose from 'mongoose';

import env from './env.js';

// Ensure DNS SRV queries resolve reliably on all platforms (including Windows local ISPs)
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // fallback to system default
}

/**
 * MongoDB connection module.
 *
 * Responsibilities:
 *  - read the connection string from the environment (MONGODB_URI, MONGO_URI fallback);
 *  - connect to the database named by DATABASE_NAME (default "mediconsent");
 *  - never open a second connection if one already exists / is in flight;
 *  - log useful messages WITHOUT ever printing credentials;
 *  - expose the live connection state so /api/health can report it honestly;
 *  - support graceful shutdown.
 */

const READY_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

let listenersRegistered = false;
let connectPromise = null;

/** Human-readable mongoose connection state. */
export function dbState() {
  return READY_STATES[mongoose.connection.readyState] || 'unknown';
}

/** True only when the driver has completed the handshake. */
export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

/** Name of the database actually selected by the driver (or the configured one). */
export function dbName() {
  return mongoose.connection.name || env.databaseName;
}

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('error', (err) => {
    // err.message never contains the connection string / credentials.
    console.error('[MediConsent] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MediConsent] MongoDB disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log(`[MediConsent] MongoDB reconnected -> ${mongoose.connection.host}`);
  });
}

/**
 * Connect to MongoDB. Resolves with the mongoose connection.
 * Throws on failure so the caller (server bootstrap) can decide whether to
 * keep serving in a degraded state.
 */
export async function connectDB(uri = env.mongoUri, options = {}) {
  if (!uri) {
    throw new Error('MongoDB connection string is not configured (set MONGODB_URI)');
  }

  // Reuse an existing connection instead of opening a duplicate one.
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectPromise) {
    return connectPromise;
  }

  mongoose.set('strictQuery', true);
  registerConnectionListeners();

  connectPromise = mongoose
    .connect(uri, {
      dbName: options.dbName || env.databaseName,
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS || env.mongoServerSelectionTimeoutMs,
      connectTimeoutMS: options.connectTimeoutMS || env.mongoConnectTimeoutMs,
      maxPoolSize: 10,
      // Fail fast on writes when Atlas is unreachable instead of hanging.
      socketTimeoutMS: 45000,
    })
    .then(() => {
      console.log(
        `[MediConsent] MongoDB connected -> ${mongoose.connection.host}/${dbName()}`
      );
      return mongoose.connection;
    })
    .catch((err) => {
      console.error('[MediConsent] MongoDB connection failed:', err.message);
      throw err;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

/** Close the connection if one is open. Safe to call when already closed. */
export async function disconnectDB() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log('[MediConsent] MongoDB connection closed.');
}

export default connectDB;
