# MediConsent — Patient-Controlled Medical Data Access

**Your Medical Records. Your Control.**

MediConsent is a college-level blockchain project: a full-stack healthcare web application that lets patients
store encrypted medical records and decide — record by record — which verified doctors may access them,
for how long, and for what purpose. Every consent decision is recorded on a local blockchain and verified
by the backend before any file is delivered.

> **Status:** Phases 1–10 complete. Full end-to-end integration, security hardening, automated test suites, and bundle optimization complete. This is a demonstration project, **not** production-certified
> healthcare software. It must never be used with real patient data.

---

## 1. Architecture

Three layers, one workspace:

| Layer | Folder | Stack | Responsibility |
|-------|--------|-------|----------------|
| Frontend | `frontend/` | React 18, Vite, Tailwind CSS, React Router DOM, Axios, Recharts, Lucide React | Public landing page + Patient / Doctor / Admin portals |
| Backend | `backend/` | Node.js, Express, MongoDB Atlas (Mongoose), JWT, bcrypt, Multer, Ethers.js | Auth, records, access requests, consent, encryption, blockchain verification |
| Blockchain | `blockchain/` | Solidity, Hardhat, Ethers.js, MetaMask (chain id `31337`) | Consent ledger: `grantConsent`, `revokeConsent`, `checkConsent`, `getConsentDetails` |

**Data placement rule**

- **On-chain:** only opaque consent facts (patient wallet, doctor wallet, opaque record id, timestamps,
  revocation flag). Never names, emails, diagnoses, or documents.
- **Off-chain (private, encrypted):** the medical documents themselves, in `backend/private_uploads/`.
  This folder is git-ignored and is never exposed as a public static directory.
- **MongoDB:** accounts, record metadata, wrapped encryption keys, requests, consent metadata,
  notifications, access logs, integrity hashes.

---

## 2. Project structure

```
MediConsent/
├── frontend/                 React 18 + Vite + Tailwind CSS
│   ├── src/
│   │   ├── assets/           images, illustrations, icons
│   │   ├── components/       reusable UI components
│   │   ├── layouts/          Patient / Doctor / Admin portal shells with sidebar
│   │   ├── pages/            route-level screens
│   │   ├── services/         Axios API clients
│   │   ├── context/          Auth / Notifications / Wallet contexts
│   │   ├── hooks/            custom hooks
│   │   └── routes/           route definitions and guards
│   ├── index.html
│   ├── tailwind.config.js    brand palette (navy + teal)
│   └── .env.example
├── backend/                  Node.js + Express
│   ├── config/               env.js, db.js
│   ├── controllers/          request handlers (by domain)
│   ├── middleware/           auth, roles, upload, validation, errors
│   ├── models/               Mongoose schemas
│   ├── routes/               Express routers
│   ├── services/             encryption, blockchain, storage, integrity
│   ├── utils/                shared helpers
│   ├── scripts/              operational scripts (admin seed)
│   ├── tests/                Vitest + Supertest
│   ├── private_uploads/      AES-256-GCM encrypted files (git-ignored)
│   ├── app.js                Express app (middleware + routes)
│   ├── server.js             bootstrap + DB connection + graceful shutdown
│   └── .env.example
├── blockchain/               Solidity + Hardhat
│   ├── contracts/            MediConsent.sol
│   ├── scripts/              deploy.js
│   ├── test/                 contract tests
│   └── hardhat.config.js
├── docs/                     architecture, blockchain + MetaMask demo guide
├── README.md
└── .gitignore
```

---

## 3. Prerequisites

- **Node.js** 18+ (verified on Node 24.14.1, npm 11.11.0)
- **MongoDB Atlas** cluster (or a local MongoDB) — free tier is enough
- **MetaMask** browser extension (needed from Phase 9 onwards)
- Git (optional in this workspace — not currently installed on the machine)

---

## 4. Setup

### 4.1 Backend

```bash
cd backend
npm install
copy .env.example .env      # PowerShell; use `cp` on macOS/Linux
# then fill in MONGODB_URI, JWT_SECRET, MASTER_ENCRYPTION_KEY
npm run dev                 # http://localhost:5000
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # MASTER_ENCRYPTION_KEY (must be 64 hex chars)
```

Health check: `GET http://localhost:5000/api/health` returns the service status, the **real** database
state, and the configured chain id.

### 4.2 Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev                 # http://localhost:5173
```

### 4.3 Blockchain

```bash
cd blockchain
npm install
npm run compile
npm run node                # local Hardhat chain on http://127.0.0.1:8545, chain id 31337
# in a second terminal, after Phase 9 adds the deploy script:
npm run deploy:localhost
```

MetaMask setup for the local chain:

1. Add a network: RPC URL `http://127.0.0.1:8545`, chain id `31337`, currency `ETH`.
2. Import a Hardhat test account using a private key printed by `npm run node`.
3. Test ETH only — no real cryptocurrency is ever used.

---

## 5. Environment variables

| Layer | File | Key variables |
|-------|------|---------------|
| Backend | `backend/.env.example` | `PORT`, `MONGODB_URI`, `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `CLIENT_URL`, `RPC_URL`, `CONTRACT_ADDRESS`, `CHAIN_ID` |
| Frontend | `frontend/.env.example` | `VITE_API_URL`, `VITE_CHAIN_ID`, `VITE_CONTRACT_ADDRESS` |

Secrets stay in the backend only. `.env` files are git-ignored; only `.env.example` templates are committed.

---

## 6. Security model (target state)

- bcrypt password hashing; passwords are never stored in plain text.
- JWT authentication with role claims; role checks are enforced **on the backend**.
- AES-256-GCM file encryption; the per-file AES key is wrapped with a master key held only in backend env vars.
- SHA-256 integrity hash recalculated on download; mismatch denies delivery and logs a security event.
- Upload validation by MIME type, extension and size (Multer); files are never served from a public URL.
- Helmet security headers, strict CORS allow-list, API rate limiting.
- Every protected doctor download re-checks on-chain consent — never the frontend's claim, never a stale cache.
- No backend private key is ever used to impersonate a patient.

---

## 7. Development phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Project setup: structure, Vite/React, Tailwind, Express, Hardhat, env templates, README | ✅ complete |
| 2 | UI foundation: landing page, reusable components, portal layouts and sidebars | ✅ complete |
| 3 | Backend + database: MongoDB Atlas, Mongoose models, API structure, validation | ✅ complete |
| 4 | Authentication and roles: registration/login, JWT, bcrypt, doctor verification | ✅ complete |
| 5 | Patient portal: dashboard, records view, access requests, consent manager, audit logs | ✅ complete |
| 6 | Doctor portal: dashboard, patient directory, request workflow, accessible records, audit | ✅ complete |
| 7 | Admin portal: system statistics, doctor verification review, audit log observer | ✅ complete |
| 8 | File security: Multer, AES-256-GCM, SHA-256 integrity, private storage, doctor certificates | ✅ complete |
| 9 | Blockchain: Solidity contract, Hardhat deploy, MetaMask, on-chain consent checks | ✅ complete |
| 10 | End-to-end testing, security hardening, route code-splitting, multi-role integration | ✅ complete |
| 11 | Final testing, responsive polish, documentation | ⏳ pending |

---

## 8. Useful commands

```bash
# backend
cd backend && npm run dev        # dev server with nodemon
cd backend && npm test           # Vitest + Supertest

# frontend
cd frontend && npm run dev       # Vite dev server
cd frontend && npm run build     # production build

# blockchain
cd blockchain && npm run compile
cd blockchain && npm run test
cd blockchain && npm run node
cd blockchain && npm run deploy:localhost
```

---

## 9. Disclaimer

MediConsent is an educational demonstration. It uses synthetic data only, runs on a local blockchain with
test ETH, and is not certified for real clinical use. Do not store real protected health information (PHI)
in this system.
