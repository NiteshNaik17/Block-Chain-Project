// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MediConsent
 * @notice Patient-Controlled Medical Data Access Consent Ledger.
 *
 * Security Architecture & Data Placement:
 * - On-Chain: Only opaque cryptographic identifiers, wallet addresses, timestamps,
 *   revocation flags, and hashes of record identifiers and purposes.
 * - NEVER on-chain: Patient names, emails, medical diagnoses, record contents,
 *   plaintext filenames, or encryption keys.
 * - All consents are patient-controlled: only the patient wallet may grant or revoke consent.
 * - Doctors may only query permissions for records explicitly authorized in active, unexpired consents.
 */
contract MediConsent {
    // --- Data Structures ----------------------------------------------------

    struct Consent {
        address patient;
        address doctor;
        bytes32 purposeHash;
        uint256 grantedAt;
        uint256 expiry;
        bool revoked;
        bytes32[] recordHashes;
    }

    // --- State Storage -------------------------------------------------------

    // consentId => Consent details
    mapping(bytes32 => Consent) private _consents;

    // consentId => recordHash => authorized (O(1) permission lookups)
    mapping(bytes32 => mapping(bytes32 => bool)) private _isRecordAuthorized;

    // patient address => list of consent IDs
    mapping(address => bytes32[]) private _patientConsents;

    // doctor address => list of consent IDs
    mapping(address => bytes32[]) private _doctorConsents;

    // --- Events --------------------------------------------------------------

    event ConsentGranted(
        bytes32 indexed consentId,
        address indexed patient,
        address indexed doctor,
        bytes32 purposeHash,
        uint256 expiry,
        bytes32[] recordHashes
    );

    event ConsentRevoked(
        bytes32 indexed consentId,
        address indexed patient,
        address indexed doctor,
        uint256 revokedAt
    );

    // --- Custom Errors -------------------------------------------------------

    error InvalidConsentId();
    error InvalidDoctorAddress();
    error DoctorCannotBePatient();
    error EmptyRecordHashes();
    error TooManyRecordHashes(uint256 count, uint256 max);
    error InvalidExpiry(uint256 expiry, uint256 currentTimestamp);
    error ConsentAlreadyExists(bytes32 consentId);
    error ConsentNotFound(bytes32 consentId);
    error NotConsentOwner(bytes32 consentId, address caller, address expectedPatient);
    error ConsentAlreadyRevoked(bytes32 consentId);
    error DuplicateRecordHash(bytes32 recordHash);

    // Maximum records allowed in a single consent transaction to prevent unbounded gas consumption
    uint256 public constant MAX_RECORDS_PER_CONSENT = 100;

    // --- External Functions --------------------------------------------------

    /**
     * @notice Grants permission to a verified doctor for specific medical record hashes.
     * @param consentId Unique deterministic identifier for this consent grant.
     * @param doctor The Ethereum wallet address of the verified doctor.
     * @param recordHashes Array of cryptographic hashes (Keccak-256) of authorized records.
     * @param purposeHash Cryptographic hash (Keccak-256) of the stated clinical access purpose.
     * @param expiry Unix timestamp (seconds) when the consent expires.
     */
    function grantConsent(
        bytes32 consentId,
        address doctor,
        bytes32[] calldata recordHashes,
        bytes32 purposeHash,
        uint256 expiry
    ) external {
        if (consentId == bytes32(0)) revert InvalidConsentId();
        if (doctor == address(0)) revert InvalidDoctorAddress();
        if (doctor == msg.sender) revert DoctorCannotBePatient();
        if (recordHashes.length == 0) revert EmptyRecordHashes();
        if (recordHashes.length > MAX_RECORDS_PER_CONSENT) {
            revert TooManyRecordHashes(recordHashes.length, MAX_RECORDS_PER_CONSENT);
        }
        if (expiry <= block.timestamp) revert InvalidExpiry(expiry, block.timestamp);
        if (_consents[consentId].patient != address(0)) revert ConsentAlreadyExists(consentId);

        // Store consent details
        Consent storage c = _consents[consentId];
        c.patient = msg.sender;
        c.doctor = doctor;
        c.purposeHash = purposeHash;
        c.grantedAt = block.timestamp;
        c.expiry = expiry;
        c.revoked = false;

        // Authorize record hashes
        for (uint256 i = 0; i < recordHashes.length; i++) {
            bytes32 rHash = recordHashes[i];
            if (rHash == bytes32(0)) revert EmptyRecordHashes();
            if (_isRecordAuthorized[consentId][rHash]) revert DuplicateRecordHash(rHash);

            _isRecordAuthorized[consentId][rHash] = true;
            c.recordHashes.push(rHash);
        }

        _patientConsents[msg.sender].push(consentId);
        _doctorConsents[doctor].push(consentId);

        emit ConsentGranted(
            consentId,
            msg.sender,
            doctor,
            purposeHash,
            expiry,
            recordHashes
        );
    }

    /**
     * @notice Revokes an active consent. Only the patient who granted it can revoke it.
     * @param consentId Unique identifier of the consent to revoke.
     */
    function revokeConsent(bytes32 consentId) external {
        Consent storage c = _consents[consentId];
        if (c.patient == address(0)) revert ConsentNotFound(consentId);
        if (c.patient != msg.sender) revert NotConsentOwner(consentId, msg.sender, c.patient);
        if (c.revoked) revert ConsentAlreadyRevoked(consentId);

        c.revoked = true;

        emit ConsentRevoked(consentId, msg.sender, c.doctor, block.timestamp);
    }

    /**
     * @notice Verifies whether a doctor currently holds active, unexpired, unrevoked consent
     *         to access a specific record hash under a given consentId.
     * @dev Fail-closed check: returns false if consent does not exist, doctor doesn't match,
     *      consent is revoked, expiry has elapsed, or the record is not authorized.
     */
    function checkConsent(
        bytes32 consentId,
        address doctor,
        bytes32 recordHash
    ) external view returns (bool) {
        Consent storage c = _consents[consentId];

        // Must exist
        if (c.patient == address(0)) return false;
        // Must not be revoked
        if (c.revoked) return false;
        // Must not be expired
        if (c.expiry <= block.timestamp) return false;
        // Doctor must match
        if (c.doctor != doctor) return false;
        // Record hash must be authorized under this consent
        return _isRecordAuthorized[consentId][recordHash];
    }

    /**
     * @notice Returns whether a consent is currently active (unrevoked and unexpired).
     */
    function isConsentActive(bytes32 consentId) external view returns (bool) {
        Consent storage c = _consents[consentId];
        return c.patient != address(0) && !c.revoked && c.expiry > block.timestamp;
    }

    /**
     * @notice Returns full details of a consent record.
     */
    function getConsentDetails(bytes32 consentId)
        external
        view
        returns (
            address patient,
            address doctor,
            bytes32 purposeHash,
            uint256 grantedAt,
            uint256 expiry,
            bool revoked,
            bytes32[] memory recordHashes
        )
    {
        Consent storage c = _consents[consentId];
        if (c.patient == address(0)) revert ConsentNotFound(consentId);

        return (
            c.patient,
            c.doctor,
            c.purposeHash,
            c.grantedAt,
            c.expiry,
            c.revoked,
            c.recordHashes
        );
    }

    /**
     * @notice Returns true if a specific record hash is authorized under a consent.
     */
    function isRecordAuthorized(bytes32 consentId, bytes32 recordHash) external view returns (bool) {
        return _isRecordAuthorized[consentId][recordHash];
    }

    /**
     * @notice Returns all consent IDs created by a patient.
     */
    function getPatientConsents(address patient) external view returns (bytes32[] memory) {
        return _patientConsents[patient];
    }

    /**
     * @notice Returns all consent IDs granted to a doctor.
     */
    function getDoctorConsents(address doctor) external view returns (bytes32[] memory) {
        return _doctorConsents[doctor];
    }
}
