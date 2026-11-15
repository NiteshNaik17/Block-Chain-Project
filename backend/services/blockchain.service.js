import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

import env from '../config/env.js';
import { httpError } from '../utils/httpError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedAbi = null;
let cachedContractAddress = null;

/**
 * Loads the MediConsent contract ABI.
 */
export function getContractAbi() {
  if (cachedAbi) return cachedAbi;

  // Try local exported config first
  const localConfigPath = path.join(__dirname, '..', 'config', 'MediConsentContract.json');
  if (fs.existsSync(localConfigPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
      if (data.abi) {
        cachedAbi = data.abi;
        if (!cachedContractAddress && data.contractAddress) {
          cachedContractAddress = data.contractAddress;
        }
        return cachedAbi;
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback to blockchain Hardhat artifact
  const artifactPath = path.join(
    __dirname,
    '..',
    '..',
    'blockchain',
    'artifacts',
    'contracts',
    'MediConsent.sol',
    'MediConsent.json'
  );

  if (fs.existsSync(artifactPath)) {
    const data = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    cachedAbi = data.abi;
    return cachedAbi;
  }

  throw httpError(
    500,
    'MediConsent contract ABI not found. Compile the contract with "npm run compile" in /blockchain.',
    'CONTRACT_ABI_NOT_FOUND'
  );
}

/**
 * Resolves the deployed contract address from environment or deployedAddress.json.
 */
export function getContractAddress() {
  const configured =
    process.env.MEDICONSENT_CONTRACT_ADDRESS ||
    process.env.CONTRACT_ADDRESS ||
    env.contractAddress;

  if (configured && configured.trim() !== '') {
    return ethers.getAddress(configured.trim());
  }

  if (cachedContractAddress) {
    return ethers.getAddress(cachedContractAddress);
  }

  const deployedJsonPath = path.join(
    __dirname,
    '..',
    '..',
    'blockchain',
    'deployedAddress.json'
  );

  if (fs.existsSync(deployedJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(deployedJsonPath, 'utf8'));
      if (data.contractAddress) {
        cachedContractAddress = ethers.getAddress(data.contractAddress);
        return cachedContractAddress;
      }
    } catch {
      // Ignore parse errors and throw below
    }
  }

  throw httpError(
    500,
    'MediConsent contract address is not configured. Deploy the contract with "npm run deploy:localhost" in /blockchain or set CONTRACT_ADDRESS.',
    'CONTRACT_ADDRESS_NOT_CONFIGURED'
  );
}

/**
 * Creates an ethers.JsonRpcProvider connected to the configured RPC URL.
 */
export function getBlockchainProvider() {
  const rpcUrl = env.rpcUrl || 'http://127.0.0.1:8545';
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Returns a read-only ethers.Contract instance for querying the blockchain.
 */
export function getReadOnlyContract(provider = null) {
  const p = provider || getBlockchainProvider();
  const address = getContractAddress();
  const abi = getContractAbi();
  return new ethers.Contract(address, abi, p);
}

/**
 * Derives a deterministic Keccak-256 hash for a medical record identifier.
 * Personal health data, diagnoses, and plaintext record details are NEVER hashed or sent on-chain.
 */
export function computeRecordHash(recordId) {
  if (!recordId) throw httpError(400, 'Record ID is required to compute hash', 'INVALID_RECORD_ID');
  return ethers.keccak256(ethers.toUtf8Bytes(String(recordId)));
}

/**
 * Derives a deterministic Keccak-256 hash for the stated clinical access purpose.
 */
export function computePurposeHash(purpose) {
  const safePurpose = String(purpose || '').trim();
  return ethers.keccak256(ethers.toUtf8Bytes(safePurpose));
}

/**
 * Generates a unique, deterministic 32-byte consent identifier.
 */
export function generateConsentId(patientAddress, doctorAddress, requestId, nonce = Date.now()) {
  const pAddr = ethers.getAddress(patientAddress);
  const dAddr = ethers.getAddress(doctorAddress);
  const reqStr = String(requestId);

  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'string', 'uint256'],
      [pAddr, dAddr, reqStr, BigInt(nonce)]
    )
  );
}

/**
 * Verifies a mined grant transaction receipt on the live blockchain.
 * Fails closed if the transaction reverted, wrong contract, wrong sender, or event mismatch.
 */
export async function verifyGrantTransaction(
  txHash,
  { expectedConsentId, expectedPatient, expectedDoctor, expectedRecordHashes, expectedExpiry }
) {
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw httpError(400, 'Invalid transaction hash format', 'INVALID_TRANSACTION_HASH');
  }

  const provider = getBlockchainProvider();
  let receipt = null;

  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch (rpcErr) {
    throw httpError(
      503,
      `Blockchain RPC unavailable: ${rpcErr.message}`,
      'BLOCKCHAIN_RPC_UNAVAILABLE'
    );
  }

  if (!receipt) {
    throw httpError(
      404,
      'Transaction receipt not found on chain. Transaction may still be pending or was dropped.',
      'TRANSACTION_NOT_MINED'
    );
  }

  if (receipt.status !== 1) {
    throw httpError(400, 'Transaction failed or reverted on chain.', 'TRANSACTION_REVERTED');
  }

  const contractAddress = getContractAddress();
  if (receipt.to && receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
    throw httpError(
      400,
      'Transaction was not sent to the MediConsent smart contract.',
      'WRONG_CONTRACT_TARGET'
    );
  }

  // Parse events from logs
  const contract = getReadOnlyContract(provider);
  let grantedEvent = null;

  for (const log of receipt.logs) {
    try {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'ConsentGranted') {
        grantedEvent = parsed;
        break;
      }
    } catch {
      // Not a log from this contract or interface
    }
  }

  if (!grantedEvent) {
    throw httpError(
      400,
      'Transaction did not emit a valid ConsentGranted event.',
      'MISSING_CONSENT_GRANTED_EVENT'
    );
  }

  const eventConsentId = grantedEvent.args.consentId;
  const eventPatient = ethers.getAddress(grantedEvent.args.patient);
  const eventDoctor = ethers.getAddress(grantedEvent.args.doctor);
  const eventExpiry = BigInt(grantedEvent.args.expiry);
  const eventRecordHashes = Array.from(grantedEvent.args.recordHashes);

  if (expectedConsentId && eventConsentId.toLowerCase() !== expectedConsentId.toLowerCase()) {
    throw httpError(400, 'Consent ID does not match transaction event.', 'CONSENT_ID_MISMATCH');
  }

  if (expectedPatient && eventPatient.toLowerCase() !== ethers.getAddress(expectedPatient).toLowerCase()) {
    throw httpError(400, 'Patient wallet does not match transaction sender.', 'PATIENT_WALLET_MISMATCH');
  }

  if (expectedDoctor && eventDoctor.toLowerCase() !== ethers.getAddress(expectedDoctor).toLowerCase()) {
    throw httpError(400, 'Doctor wallet does not match transaction recipient.', 'DOCTOR_WALLET_MISMATCH');
  }

  if (expectedExpiry && Math.abs(Number(eventExpiry) - Number(expectedExpiry)) > 120) {
    throw httpError(400, 'Expiry timestamp differs from transaction event.', 'EXPIRY_MISMATCH');
  }

  if (expectedRecordHashes && Array.isArray(expectedRecordHashes)) {
    const normExpected = expectedRecordHashes.map((h) => h.toLowerCase()).sort();
    const normEvent = eventRecordHashes.map((h) => h.toLowerCase()).sort();
    if (normExpected.length !== normEvent.length || !normExpected.every((h, i) => h === normEvent[i])) {
      throw httpError(400, 'Authorized records do not match transaction event.', 'RECORD_HASHES_MISMATCH');
    }
  }

  return {
    confirmed: true,
    blockNumber: receipt.blockNumber,
    transactionHash: receipt.hash,
    consentId: eventConsentId,
    patient: eventPatient,
    doctor: eventDoctor,
    expiry: Number(eventExpiry),
  };
}

/**
 * Verifies a mined revocation transaction receipt on the live blockchain.
 */
export async function verifyRevokeTransaction(txHash, { expectedConsentId, expectedPatient }) {
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw httpError(400, 'Invalid transaction hash format', 'INVALID_TRANSACTION_HASH');
  }

  const provider = getBlockchainProvider();
  let receipt = null;

  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch (rpcErr) {
    throw httpError(
      503,
      `Blockchain RPC unavailable: ${rpcErr.message}`,
      'BLOCKCHAIN_RPC_UNAVAILABLE'
    );
  }

  if (!receipt || receipt.status !== 1) {
    throw httpError(400, 'Transaction not found or reverted on chain.', 'TRANSACTION_REVERTED');
  }

  const contractAddress = getContractAddress();
  const contract = getReadOnlyContract(provider);
  let revokedEvent = null;

  for (const log of receipt.logs) {
    try {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'ConsentRevoked') {
        revokedEvent = parsed;
        break;
      }
    } catch {
      // Skip non-matching log
    }
  }

  if (!revokedEvent) {
    throw httpError(
      400,
      'Transaction did not emit a valid ConsentRevoked event.',
      'MISSING_CONSENT_REVOKED_EVENT'
    );
  }

  const eventConsentId = revokedEvent.args.consentId;
  const eventPatient = ethers.getAddress(revokedEvent.args.patient);

  if (expectedConsentId && eventConsentId.toLowerCase() !== expectedConsentId.toLowerCase()) {
    throw httpError(400, 'Consent ID does not match revoke event.', 'CONSENT_ID_MISMATCH');
  }

  if (expectedPatient && eventPatient.toLowerCase() !== ethers.getAddress(expectedPatient).toLowerCase()) {
    throw httpError(400, 'Revoking wallet does not match patient owner.', 'PATIENT_WALLET_MISMATCH');
  }

  return {
    confirmed: true,
    blockNumber: receipt.blockNumber,
    transactionHash: receipt.hash,
    consentId: eventConsentId,
  };
}

/**
 * Critical Section: Queries the live deployed smart contract to check if a doctor
 * holds valid, active permission for a specific medical record.
 *
 * Fail-Closed:
 * If RPC fails, contract cannot be queried, or checkConsent returns false,
 * permission is DENIED.
 */
export async function checkLiveOnChainConsent(consentId, doctorWallet, recordId) {
  if (!consentId || !doctorWallet || !recordId) return false;

  try {
    const doctorAddress = ethers.getAddress(doctorWallet);
    const recordHash = computeRecordHash(recordId);
    const contract = getReadOnlyContract();

    const isAuthorized = await contract.checkConsent(consentId, doctorAddress, recordHash);
    return Boolean(isAuthorized);
  } catch (error) {
    // Fail closed: any error during live check means access is denied
    console.error(`[MediConsent Blockchain] checkConsent query error: ${error.message}`);
    return false;
  }
}

/**
 * Queries live contract details for a consentId.
 */
export async function getLiveConsentDetails(consentId) {
  const contract = getReadOnlyContract();
  const details = await contract.getConsentDetails(consentId);

  return {
    patient: details.patient,
    doctor: details.doctor,
    purposeHash: details.purposeHash,
    grantedAt: Number(details.grantedAt),
    expiry: Number(details.expiry),
    revoked: details.revoked,
    recordHashes: Array.from(details.recordHashes),
  };
}

/**
 * Checks if a consent is currently active on-chain (not revoked and not expired).
 */
export async function isLiveConsentActive(consentId) {
  try {
    const contract = getReadOnlyContract();
    return await contract.isConsentActive(consentId);
  } catch {
    return false;
  }
}

export default {
  getContractAbi,
  getContractAddress,
  getBlockchainProvider,
  getReadOnlyContract,
  computeRecordHash,
  computePurposeHash,
  generateConsentId,
  verifyGrantTransaction,
  verifyRevokeTransaction,
  checkLiveOnChainConsent,
  getLiveConsentDetails,
  isLiveConsentActive,
};
