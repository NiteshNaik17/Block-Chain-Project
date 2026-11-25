# Presidency University
## School of Computer Science and Engineering (SOCSE)
### A MINI PROJECT REPORT ON
# MediConsent: Patient-Controlled Medical Data Access

**Project Type:** Mini Project  
**Academic Year:** 2026  
**Institution:** SOCSE, Presidency University, Bengaluru  
**Live Project URL:** `https://block-chain-project-front-end.onrender.com`  

**Submitted by:**
- Nanditha R – 20241IST0150
- Nitesh Naik – 20241IST0166
- Prakruti – 20241IST0153
- Aadithya B M – 20241IST0160

---

## TABLE OF CONTENTS
- Abstract
- 1. Introduction
- 2. Problem Statement, Objectives and Scope
- 3. Existing System and Proposed System
- 4. System Architecture
- 5. Module Description
- 6. Blockchain and Smart Contract Implementation
- 7. Medical Data Security
- 8. Database Design
- 9. System Workflow and Implementation
- 10. Testing and Results
- 11. Advantages, Limitations and Future Enhancements
- 12. Conclusion and References

---

## ABSTRACT
Healthcare institutions traditionally keep patient records in centralized databases controlled by the hospital. In such systems the patient usually signs a single broad consent form and has little visibility into which professionals view the records, for what purpose, or for how long. A breach or an insider with database access can expose sensitive documents such as prescriptions, laboratory reports and scans.

**MediConsent – Patient-Controlled Medical Data Access** is a web application that returns control of medical records to the patient. Patients upload documents to a private vault where each file is protected with AES-256-GCM authenticated encryption and certified with a SHA-256 integrity hash. Doctors cannot browse records. A verified doctor submits an access request stating the clinical category and duration; the patient decides which individual records, if any, to share.

Consent is recorded through a Solidity smart contract on an Ethereum-compatible local blockchain (Hardhat). The patient signs the transaction with MetaMask, and the application communicates with the contract using Ethers.js. Only consent metadata and hashes are stored on-chain; medical files and personal information remain off-chain. When a doctor requests a file, the backend checks the live blockchain permission before decrypting and delivering it.

The expected benefits are patient-controlled, record-level and time-bound access, tamper-evident consent records, protection of files at rest, detection of modified files, and an auditable history of access. The system is an academic prototype and has the limitations described in Chapter 11.

---

## 1. INTRODUCTION

### 1.1 Background
Digital health records have replaced paper files in most healthcare settings. They allow faster diagnosis and easier sharing between clinicians, but they also concentrate large volumes of sensitive personal information in a few systems. Medical data is permanent: a diagnosis or genetic history cannot be changed after it is leaked.

### 1.2 Importance of Patient Data Privacy
Privacy regulations such as HIPAA in the United States and the GDPR in the European Union require that health data be disclosed only with proper authorization, limited to the minimum necessary, and protected with technical safeguards. Patients must also be able to withdraw consent. These principles guided the design of MediConsent.

### 1.3 Challenges in Traditional Systems
1. Consent is broad and one-time, so a patient cannot share a cardiology report while withholding an unrelated note.
2. Revocation is usually an internal database flag that the patient cannot independently verify.
3. Files stored as plain documents can be read by administrators or by an intruder who gains access.
4. Access history is limited and not controlled by the patient.

### 1.4 Role of Blockchain
A blockchain is a shared, append-only ledger that is difficult to alter after the fact. Recording consent on a smart contract gives a tamper-evident decision that the patient signs personally and that the backend can check at the moment of access. Because blockchain storage is public and permanent, MediConsent keeps no medical content on-chain.

### 1.5 Purpose of MediConsent
The purpose of this project is to demonstrate a practical design in which patients own their records, doctors request access for a stated purpose, and every release of a document depends on both the patient’s decision and a live blockchain check.

---

## 2. PROBLEM STATEMENT, OBJECTIVES AND SCOPE

### 2.1 Problem Statement
Patients may have limited control over who accesses their medical records, for what purpose, and for how long. Existing systems offer all-or-nothing disclosure, revocation that cannot be proven, and stored files that insiders can read.

### 2.2 Objectives
- Provide secure medical record management.
- Allow patients to control doctor access to individual records.
- Implement digital consent using smart contracts.
- Protect uploaded files through AES-256-GCM encryption.
- Verify file integrity using SHA-256.
- Maintain secure access and audit records.

### 2.3 Scope
The current implementation provides three role-based portals (patient, doctor and administrator); an encrypted medical vault; doctor access requests with patient approval; on-chain consent grant and revocation with expiry and record-scope checks; blockchain-gated downloads; and activity and access logs. It is built with React, Vite and Tailwind CSS on the frontend, Node.js and Express on the backend, and MongoDB for data.

*Out of scope:* integration with real hospital systems, certified clinical use, healthcare-interoperability standards, and deployment on a production blockchain network.

---

## 3. EXISTING SYSTEM AND PROPOSED SYSTEM

### 3.1 Existing System
In a typical centralized system the hospital stores records in its own database and controls access through internal role rules. The patient’s authorization is captured once on a form, and the hospital’s staff and administrators hold the means to read stored files. Consent policy sits in the hospital’s own software, so the patient cannot audit it independently.

### 3.2 Proposed System
MediConsent separates ownership from custody. Files are encrypted before storage, and a doctor receives a file only after the patient approves specific records and signs a consent on the blockchain. The backend acts as an enforcement point that re-checks the contract on every download.

### 3.3 Comparison

| Aspect | Existing centralized system | MediConsent |
| :--- | :--- | :--- |
| **Consent model** | Broad, one-time form | Per record, per doctor, per purpose, time-bound |
| **File protection** | Plain files or disk-level encryption | AES-256-GCM per file with unique IV |
| **Integrity check** | Rarely verified | SHA-256 re-verified at every download |
| **Revocation** | Internal database flag | Patient-signed on-chain revocation |
| **Access decision** | Hospital policy only | Patient decision plus live smart contract check |
| **Audit trail** | Controlled by the institution | Contract events and access logs |
| **On-chain data** | Not applicable | Hashes and timestamps only, no medical content |

### 3.4 Advantages of the Proposed Approach
Patients gain granular control and provable revocation; doctors see only what has been authorized; and insiders or intruders obtain only ciphertext from storage.

---

## 4. SYSTEM ARCHITECTURE
MediConsent follows a three-tier design: a React presentation tier, a Node.js and Express application tier, and a persistence tier (MongoDB) together with a blockchain tier for consent.

- **A. Application Flow:** Patient / Doctor / Admin -> React + Vite + Tailwind CSS Frontend -> Node.js and Express REST API Backend -> Authentication (JWT, bcrypt) and Role-Based Access Control -> MongoDB Database (Mongoose).
- **B. Secure File Flow:** Medical file upload -> SHA-256 hash -> AES-256-GCM encryption -> Private storage (disk + persistent buffer).
- **C. Blockchain Consent Flow:** Patient consent -> MetaMask wallet -> Ethers.js -> Solidity contract (`MediConsent.sol`) -> Local blockchain (Hardhat).

The frontend communicates with the backend through REST APIs, and the session token is kept in an HttpOnly cookie. The backend validates the token and role, handles file encryption, and reads and writes MongoDB. For consent, the patient’s browser talks to the smart contract through MetaMask and Ethers.js, while the backend queries the same contract to verify permission.

---

## 5. MODULE DESCRIPTION

### 5.1 Patient Module
- Registration, login and a dashboard of vault records, pending requests and active consents.
- Upload and management of medical records in an encrypted vault.
- Review of doctor requests; approve or reject, and select the records to share.
- Grant and revoke consent through MetaMask; view consent history and access history.

### 5.2 Doctor Module
- Registration followed by administrator verification.
- Privacy-preserving patient search showing identifying details only.
- Submission of category-based access requests with a duration.
- Access to, and download of, only those records covered by an active consent.

### 5.3 Admin Module
- Administrator authentication and dashboard.
- Doctor verification, including review of submitted certificates.
- User management (suspend or activate accounts).
- Inspection of system-wide activity and audit logs.

---

## 6. BLOCKCHAIN AND SMART CONTRACT IMPLEMENTATION
A blockchain is a distributed ledger in which records are grouped into blocks that are chained by cryptographic hashes. MediConsent uses an Ethereum-compatible blockchain so that consent decisions are signed by the patient and cannot be silently altered. Smart contracts are written in Solidity (version `^0.8.24`) and compiled and tested with Hardhat, which provides a local blockchain for development. MetaMask holds the user’s keys and signs transactions, and Ethers.js connects the application to the contract.

### 6.1 `MediConsent.sol`
Each consent stores the patient and doctor addresses, a Keccak-256 hash of the purpose, the grant time, an expiry time, a revoked flag and an array of record hashes. A nested mapping from consent identifier and record hash to a boolean allows permission to be checked with a single lookup.

- `grantConsent` – called by the patient’s wallet; records the doctor, record hashes, purpose hash and expiry, and emits `ConsentGranted`. At most 100 records are allowed per consent, and a patient cannot grant consent to their own address.
- `revokeConsent` – only the patient who owns the consent may call it; it marks the consent revoked and emits `ConsentRevoked`.
- `checkConsent(consentId, doctor, recordHash)` – used by the backend before a download. It returns true only if the consent exists, is not revoked, has not expired, belongs to that doctor and includes the record hash. Otherwise it returns false rather than failing.

Record identifiers and purposes are hashed with Keccak-256 before submission. The transaction hash returned by MetaMask is reconciled into the consents collection in MongoDB. Medical files and personal information are never written to the blockchain.

---

## 7. MEDICAL DATA SECURITY
- **AES-256-GCM:** Each uploaded file is encrypted with a 256-bit key using Galois/Counter Mode. A new random 12-byte initialization vector is generated for every file, and the 16-byte authentication tag is stored with the record. During decryption the tag is verified first, so any change to the stored ciphertext is detected and the file is not delivered.
- **SHA-256:** Before encryption, the hash of the original file is computed and saved. After decryption, the hash is computed again; if the two values differ, delivery is aborted and a security event is logged. For example, changing a single byte of a report gives a completely different hash.
- **Authentication and Authorization:** Passwords are hashed with bcrypt (12 salt rounds). Sessions use a JWT stored in an HttpOnly cookie, and a role-checking middleware restricts each route to patient, doctor or admin. Failed logins and downloads are rate limited.
- **Secure Storage:** Files are saved under opaque hashed names in a private directory that is not served publicly. Uploads are validated, and a path-resolution check rejects traversal attempts such as `../`. Downloads are possible only through controlled API routes. The ciphertext is also kept in MongoDB so a file survives a container restart on a cloud host.

---

## 8. DATABASE DESIGN
MediConsent uses MongoDB with Mongoose schemas.

| Collection | Purpose and Important Fields |
| :--- | :--- |
| **User** | Identity and role (patient, doctor, admin); bcrypt password hash; unique wallet address; verification and account status |
| **MedicalRecord** | Document metadata (title, category, date, hospital) and encryption data (IV, auth tag, integrity hash, file reference, encrypted buffer) |
| **AccessRequest** | A doctor’s request to a patient: category, purpose, duration and status |
| **Consent** | Off-chain mirror of an on-chain consent: patient, doctor, authorized records, status, transaction hash, blockchain consent id |
| **AccessLog** | Append-only record of each doctor access attempt and its outcome |
| **ActivityLog** | System activity such as logins, downloads, grants and revocations |
| **Notification** | User alerts for events such as new requests |
| **WalletNonce** | Nonce used to verify wallet ownership by message signature |

Records and consents reference users by identifier, and a consent lists the records it authorizes.

---

## 9. SYSTEM WORKFLOW AND IMPLEMENTATION
1. Patient registers and logs in.
2. Doctor registers; admin verifies.
3. Patient uploads record.
4. File is hashed with SHA-256 and AES-256-GCM encrypted.
5. Doctor submits access request.
6. Patient approves/rejects request and cherry-picks records.
7. Patient signs consent transaction via MetaMask.
8. Smart contract records consent on-chain.
9. Doctor requests authorized record download.
10. Backend checks live blockchain consent.
11. If authorized, backend decrypts in memory, verifies SHA-256 digest, and streams file to doctor.
12. Patient revokes consent anytime; future access is immediately denied.

---

## 10. TESTING AND RESULTS
The backend is tested with Vitest and Supertest.

| Test Suite | Tests | Passed | Focus |
| :--- | :---: | :---: | :--- |
| `auth.test.js` | 18 | 18 | Registration, login, sessions |
| `patient.test.js` | 24 | 24 | Vault, requests, consents |
| `doctor.test.js` | 22 | 22 | Directory, requests, gated downloads |
| `admin.test.js` | 16 | 16 | Doctor verification, user management |
| `security.phase8.js` | 20 | 20 | Role escalation, path traversal, tampering |
| `blockchain.test.js` | 15 | 15 | Consent verification, fail-closed behaviour |
| `e2e.phase10.test.js` | 28 | 28 | End-to-end consent lifecycle |
| **Total** | **143** | **143** | **100% Pass Rate** |

- **Encryption and Integrity:** A modified ciphertext byte fails GCM tag verification and no file is delivered.
- **Authorization:** A doctor calling a patient upload route receives 403; path-traversal requests are rejected.
- **Blockchain:** If the blockchain is unreachable or reverts, access is denied (fail-closed).

---

## 11. ADVANTAGES, LIMITATIONS AND FUTURE ENHANCEMENTS

### 11.1 Advantages
- Patient-controlled, record-level and time-bound access.
- Secure storage of medical files with authenticated encryption.
- Blockchain-based, patient-signed consent records.
- File integrity verification on every download.
- Role-based access control and an auditable access history.

### 11.2 Limitations
- The project uses a local Hardhat blockchain for demonstration, and its state resets when the local chain restarts.
- Patients and doctors need wallet integration for blockchain consent operations.
- Revocation prevents future access through the application but cannot delete copies already downloaded.
- The encryption key is held by the server, so a fully compromised server could decrypt files.
- The project is an academic prototype, not a certified production healthcare system.

### 11.3 Future Enhancements
- Deploy the smart contract to a suitable production blockchain (Layer-2 rollup).
- Integrate with real hospital information systems.
- Improve scalable medical file storage with IPFS / decentralized storage.
- Add interoperability with healthcare standards (HL7 FHIR).
- Conduct further security and usability testing.

---

## 12. CONCLUSION AND REFERENCES

### 12.1 Conclusion
MediConsent demonstrates how a patient can control access to medical records through a combination of encrypted storage, integrity verification, role-based access and blockchain-recorded consent. Files are encrypted with AES-256-GCM and verified with SHA-256, while consent is signed by the patient and checked against a smart contract at the moment of download. The prototype shows that access can be limited to chosen records, for a stated purpose and a fixed period, and that revoked or expired consent blocks later access. With the enhancements listed above it can be taken further toward real-world use.

### 12.2 References
- [1] React Documentation: `https://react.dev`
- [2] Node.js Documentation: `https://nodejs.org/docs/latest/api/`
- [3] Express.js Documentation: `https://expressjs.com`
- [4] MongoDB Documentation: `https://www.mongodb.com/docs/`
- [5] Mongoose Documentation: `https://mongoosejs.com/docs/`
- [6] Solidity Documentation: `https://docs.soliditylang.org`
- [7] Hardhat Documentation: `https://hardhat.org/docs`
- [8] Ethers.js v6 Documentation: `https://docs.ethers.org/v6/`
- [9] MetaMask Developer Documentation: `https://docs.metamask.io`
- [10] OWASP Top Ten: `https://owasp.org/www-project-top-ten/`
- [11] NIST SP 800-38D: Recommendation for Block Cipher Modes of Operation: GCM. `https://csrc.nist.gov/pubs/sp/800/38/d/final`
- [12] NIST FIPS 180-4: Secure Hash Standard. `https://csrc.nist.gov/pubs/fips/180-4/upd1/final`
- [13] RFC 7519: JSON Web Token (JWT). `https://datatracker.ietf.org/doc/html/rfc7519`
