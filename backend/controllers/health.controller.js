import { dbName, dbState, isDbConnected } from '../config/db.js';
import env from '../config/env.js';

const SERVICE_NAME = 'mediconsent-api';
const SERVICE_VERSION = '1.0.0';
const APPLICATION_NAME = 'MediConsent';

/**
 * Build the health payload.
 *
 * The database state is always read from the live Mongoose connection - it is
 * never hardcoded to "connected". `status` describes the API process itself
 * (it is answering requests), while `database` / `degraded` describe whether the
 * service is fully operational.
 */
export function buildHealthPayload() {
  const database = dbState();
  const databaseConnected = isDbConnected();

  return {
    application: APPLICATION_NAME,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: env.nodeEnv,
    status: 'ok',
    degraded: !databaseConnected,
    database,
    databaseConnected,
    databaseName: dbName(),
    blockchain: {
      rpcUrl: env.rpcUrl,
      chainId: env.chainId,
      contractConfigured: Boolean(env.contractAddress),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * GET /api/health  and  GET /api/v1/health
 *
 * Liveness probe: returns 200 whenever the process is serving requests, and
 * reports the real database state (including "disconnected") in the body so a
 * degraded deployment is visible instead of silently faked as healthy.
 */
export function getHealth(req, res) {
  res.status(200).json(buildHealthPayload());
}

export default { getHealth, buildHealthPayload };
