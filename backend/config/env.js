import dotenv from 'dotenv';

dotenv.config();

/** First defined, non-empty value wins. */
function firstDefined(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

/**
 * Centralised, read-only view of the backend environment.
 * Secrets are only read from process.env / .env - never hardcoded.
 *
 * Several variables accept a legacy alias so that existing deployments keep
 * working: MONGODB_URI|MONGO_URI, FRONTEND_URL|CLIENT_URL,
 * BLOCKCHAIN_RPC_URL|RPC_URL.
 */
const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,

  mongoUri: firstDefined(process.env.MONGODB_URI, process.env.MONGO_URI),
  databaseName: firstDefined(process.env.DATABASE_NAME) || 'mediconsent',

  // Timeouts (ms) - keeps a dead Atlas cluster from hanging the API process.
  mongoServerSelectionTimeoutMs: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
  mongoConnectTimeoutMs: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10000,

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  authCookieName: process.env.AUTH_COOKIE_NAME || 'mediconsent_token',

  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || '',

  clientUrl: firstDefined(process.env.FRONTEND_URL, process.env.CLIENT_URL) || 'http://localhost:5173',

  rpcUrl: firstDefined(process.env.BLOCKCHAIN_RPC_URL, process.env.RPC_URL) || 'http://127.0.0.1:8545',
  contractAddress: firstDefined(process.env.MEDICONSENT_CONTRACT_ADDRESS, process.env.CONTRACT_ADDRESS) || '',
  chainId: Number(process.env.CHAIN_ID) || 31337,

  adminName: process.env.ADMIN_NAME || 'MediConsent Administrator',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminMobile: process.env.ADMIN_MOBILE || '+91 00000 00000',
});

export const isTest = env.nodeEnv === 'test';
export const isProduction = env.nodeEnv === 'production';

export default env;
