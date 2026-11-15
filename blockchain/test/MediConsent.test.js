const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('MediConsent Smart Contract', function () {
  let MediConsent;
  let contract;
  let deployer, patient, doctor, doctor2, stranger;

  const SAMPLE_CONSENT_ID = ethers.keccak256(ethers.toUtf8Bytes('consent-test-12345'));
  const SAMPLE_RECORD_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes('record-65a8c9b2e1f4'));
  const SAMPLE_RECORD_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes('record-65a8c9b2e1f5'));
  const SAMPLE_RECORD_HASH_UNAUTHORIZED = ethers.keccak256(ethers.toUtf8Bytes('record-unauthorized'));
  const SAMPLE_PURPOSE_HASH = ethers.keccak256(ethers.toUtf8Bytes('Cardiology consultation and review'));

  beforeEach(async function () {
    [deployer, patient, doctor, doctor2, stranger] = await ethers.getSigners();

    MediConsent = await ethers.getContractFactory('MediConsent');
    contract = await MediConsent.deploy();
    await contract.waitForDeployment();
  });

  describe('1. Deployment & Initial State', function () {
    it('deploys successfully and has a valid address', async function () {
      const address = await contract.getAddress();
      expect(address).to.properAddress;
      expect(await contract.MAX_RECORDS_PER_CONSENT()).to.equal(100n);
    });
  });

  describe('2. Granting Consent', function () {
    it('allows a patient to grant consent for authorized records and emits ConsentGranted', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 86400 * 7; // 7 days

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          doctor.address,
          [SAMPLE_RECORD_HASH_1, SAMPLE_RECORD_HASH_2],
          SAMPLE_PURPOSE_HASH,
          expiry
        )
      )
        .to.emit(contract, 'ConsentGranted')
        .withArgs(
          SAMPLE_CONSENT_ID,
          patient.address,
          doctor.address,
          SAMPLE_PURPOSE_HASH,
          expiry,
          [SAMPLE_RECORD_HASH_1, SAMPLE_RECORD_HASH_2]
        );

      // Verify stored details
      const details = await contract.getConsentDetails(SAMPLE_CONSENT_ID);
      expect(details.patient).to.equal(patient.address);
      expect(details.doctor).to.equal(doctor.address);
      expect(details.purposeHash).to.equal(SAMPLE_PURPOSE_HASH);
      expect(details.expiry).to.equal(expiry);
      expect(details.revoked).to.be.false;
      expect(details.recordHashes).to.deep.equal([SAMPLE_RECORD_HASH_1, SAMPLE_RECORD_HASH_2]);

      expect(await contract.isConsentActive(SAMPLE_CONSENT_ID)).to.be.true;
      expect(await contract.isRecordAuthorized(SAMPLE_CONSENT_ID, SAMPLE_RECORD_HASH_1)).to.be.true;
      expect(await contract.isRecordAuthorized(SAMPLE_CONSENT_ID, SAMPLE_RECORD_HASH_2)).to.be.true;
      expect(await contract.isRecordAuthorized(SAMPLE_CONSENT_ID, SAMPLE_RECORD_HASH_UNAUTHORIZED)).to.be.false;

      // Check consent tracking lists
      const pConsents = await contract.getPatientConsents(patient.address);
      expect(pConsents).to.include(SAMPLE_CONSENT_ID);
      const dConsents = await contract.getDoctorConsents(doctor.address);
      expect(dConsents).to.include(SAMPLE_CONSENT_ID);
    });

    it('reverts when consentId is bytes32(0)', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        contract.connect(patient).grantConsent(
          ethers.ZeroHash,
          doctor.address,
          [SAMPLE_RECORD_HASH_1],
          SAMPLE_PURPOSE_HASH,
          expiry
        )
      ).to.be.revertedWithCustomError(contract, 'InvalidConsentId');
    });

    it('reverts when doctor is zero address', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          ethers.ZeroAddress,
          [SAMPLE_RECORD_HASH_1],
          SAMPLE_PURPOSE_HASH,
          expiry
        )
      ).to.be.revertedWithCustomError(contract, 'InvalidDoctorAddress');
    });

    it('reverts when doctor address matches caller (patient cannot self-grant)', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          patient.address,
          [SAMPLE_RECORD_HASH_1],
          SAMPLE_PURPOSE_HASH,
          expiry
        )
      ).to.be.revertedWithCustomError(contract, 'DoctorCannotBePatient');
    });

    it('reverts when recordHashes array is empty', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          doctor.address,
          [],
          SAMPLE_PURPOSE_HASH,
          expiry
        )
      ).to.be.revertedWithCustomError(contract, 'EmptyRecordHashes');
    });

    it('reverts when any recordHash is bytes32(0)', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          doctor.address,
          [SAMPLE_RECORD_HASH_1, ethers.ZeroHash],
          SAMPLE_PURPOSE_HASH,
          expiry
        )
      ).to.be.revertedWithCustomError(contract, 'EmptyRecordHashes');
    });

    it('reverts on duplicate recordHash in the same consent', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          doctor.address,
          [SAMPLE_RECORD_HASH_1, SAMPLE_RECORD_HASH_1],
          SAMPLE_PURPOSE_HASH,
          expiry
        )
      ).to.be.revertedWithCustomError(contract, 'DuplicateRecordHash');
    });

    it('reverts when expiry timestamp is in the past or present', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const pastExpiry = latestBlock.timestamp - 10;

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          doctor.address,
          [SAMPLE_RECORD_HASH_1],
          SAMPLE_PURPOSE_HASH,
          pastExpiry
        )
      ).to.be.revertedWithCustomError(contract, 'InvalidExpiry');
    });

    it('prevents duplicate consent records with the same consentId', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await contract.connect(patient).grantConsent(
        SAMPLE_CONSENT_ID,
        doctor.address,
        [SAMPLE_RECORD_HASH_1],
        SAMPLE_PURPOSE_HASH,
        expiry
      );

      await expect(
        contract.connect(patient).grantConsent(
          SAMPLE_CONSENT_ID,
          doctor2.address,
          [SAMPLE_RECORD_HASH_2],
          SAMPLE_PURPOSE_HASH,
          expiry + 100
        )
      ).to.be.revertedWithCustomError(contract, 'ConsentAlreadyExists').withArgs(SAMPLE_CONSENT_ID);
    });
  });

  describe('3. Revoking Consent', function () {
    let expiry;

    beforeEach(async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      expiry = latestBlock.timestamp + 86400 * 30; // 30 days

      await contract.connect(patient).grantConsent(
        SAMPLE_CONSENT_ID,
        doctor.address,
        [SAMPLE_RECORD_HASH_1, SAMPLE_RECORD_HASH_2],
        SAMPLE_PURPOSE_HASH,
        expiry
      );
    });

    it('allows only the patient who granted the consent to revoke it', async function () {
      await expect(contract.connect(patient).revokeConsent(SAMPLE_CONSENT_ID))
        .to.emit(contract, 'ConsentRevoked')
        .withArgs(SAMPLE_CONSENT_ID, patient.address, doctor.address, (await ethers.provider.getBlock('latest')).timestamp + 1);

      const details = await contract.getConsentDetails(SAMPLE_CONSENT_ID);
      expect(details.revoked).to.be.true;
      expect(await contract.isConsentActive(SAMPLE_CONSENT_ID)).to.be.false;
    });

    it('reverts when a non-patient or stranger attempts to revoke consent', async function () {
      await expect(
        contract.connect(stranger).revokeConsent(SAMPLE_CONSENT_ID)
      ).to.be.revertedWithCustomError(contract, 'NotConsentOwner');

      await expect(
        contract.connect(doctor).revokeConsent(SAMPLE_CONSENT_ID)
      ).to.be.revertedWithCustomError(contract, 'NotConsentOwner');
    });

    it('reverts when revoking a non-existent consentId', async function () {
      const fakeConsentId = ethers.keccak256(ethers.toUtf8Bytes('non-existent-consent'));
      await expect(
        contract.connect(patient).revokeConsent(fakeConsentId)
      ).to.be.revertedWithCustomError(contract, 'ConsentNotFound').withArgs(fakeConsentId);
    });

    it('reverts when revoking an already revoked consent', async function () {
      await contract.connect(patient).revokeConsent(SAMPLE_CONSENT_ID);

      await expect(
        contract.connect(patient).revokeConsent(SAMPLE_CONSENT_ID)
      ).to.be.revertedWithCustomError(contract, 'ConsentAlreadyRevoked').withArgs(SAMPLE_CONSENT_ID);
    });
  });

  describe('4. Live Permission Verification (checkConsent)', function () {
    let expiry;

    beforeEach(async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      expiry = latestBlock.timestamp + 3600; // 1 hour

      await contract.connect(patient).grantConsent(
        SAMPLE_CONSENT_ID,
        doctor.address,
        [SAMPLE_RECORD_HASH_1, SAMPLE_RECORD_HASH_2],
        SAMPLE_PURPOSE_HASH,
        expiry
      );
    });

    it('returns true when doctor, consent, record and window are all valid', async function () {
      expect(
        await contract.checkConsent(SAMPLE_CONSENT_ID, doctor.address, SAMPLE_RECORD_HASH_1)
      ).to.be.true;

      expect(
        await contract.checkConsent(SAMPLE_CONSENT_ID, doctor.address, SAMPLE_RECORD_HASH_2)
      ).to.be.true;
    });

    it('returns false for an unselected or unauthorized record hash', async function () {
      expect(
        await contract.checkConsent(SAMPLE_CONSENT_ID, doctor.address, SAMPLE_RECORD_HASH_UNAUTHORIZED)
      ).to.be.false;
    });

    it('returns false when queried for a different doctor address', async function () {
      expect(
        await contract.checkConsent(SAMPLE_CONSENT_ID, doctor2.address, SAMPLE_RECORD_HASH_1)
      ).to.be.false;

      expect(
        await contract.checkConsent(SAMPLE_CONSENT_ID, stranger.address, SAMPLE_RECORD_HASH_1)
      ).to.be.false;
    });

    it('returns false for non-existent consentId', async function () {
      const unknownId = ethers.keccak256(ethers.toUtf8Bytes('unknown-consent'));
      expect(
        await contract.checkConsent(unknownId, doctor.address, SAMPLE_RECORD_HASH_1)
      ).to.be.false;
    });

    it('returns false immediately once consent is revoked', async function () {
      await contract.connect(patient).revokeConsent(SAMPLE_CONSENT_ID);

      expect(
        await contract.checkConsent(SAMPLE_CONSENT_ID, doctor.address, SAMPLE_RECORD_HASH_1)
      ).to.be.false;
    });

    it('returns false automatically when consent expiry has elapsed', async function () {
      // Advance blockchain time past expiry
      await time.increaseTo(expiry + 10);

      expect(
        await contract.checkConsent(SAMPLE_CONSENT_ID, doctor.address, SAMPLE_RECORD_HASH_1)
      ).to.be.false;

      expect(await contract.isConsentActive(SAMPLE_CONSENT_ID)).to.be.false;
    });
  });

  describe('5. Data Privacy & Non-PHI Compliance', function () {
    it('stores only cryptographic hashes, addresses, timestamps and boolean flags', async function () {
      const latestBlock = await ethers.provider.getBlock('latest');
      const expiry = latestBlock.timestamp + 3600;

      await contract.connect(patient).grantConsent(
        SAMPLE_CONSENT_ID,
        doctor.address,
        [SAMPLE_RECORD_HASH_1],
        SAMPLE_PURPOSE_HASH,
        expiry
      );

      const details = await contract.getConsentDetails(SAMPLE_CONSENT_ID);

      // Verify no plain-text strings are exposed or stored in the struct
      expect(details.patient).to.equal(patient.address);
      expect(details.doctor).to.equal(doctor.address);
      expect(details.purposeHash).to.equal(SAMPLE_PURPOSE_HASH);
      expect(typeof details.grantedAt).to.equal('bigint');
      expect(typeof details.expiry).to.equal('bigint');
      expect(typeof details.revoked).to.equal('boolean');
      expect(details.recordHashes).to.deep.equal([SAMPLE_RECORD_HASH_1]);
    });
  });
});
