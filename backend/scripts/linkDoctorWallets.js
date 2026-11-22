import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import User from '../models/User.js';
import MedicalRecord from '../models/MedicalRecord.js';
import AccessRequest from '../models/AccessRequest.js';
import Consent from '../models/Consent.js';
import crypto from 'crypto';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to Atlas DB');

  // 1. Give each doctor without a wallet a unique valid Ethereum address
  const doctors = await User.find({ role: 'doctor' }).sort({ email: 1 });
  for (const doc of doctors) {
    if (!doc.walletAddress) {
      const wallet = ethers.Wallet.createRandom().address;
      await User.updateOne({ _id: doc._id }, { $set: { walletAddress: wallet } });
      console.log(`Updated Doctor ${doc.fullName} (${doc.email}) -> wallet: ${wallet}`);
    } else {
      console.log(`Doctor ${doc.fullName} already has wallet: ${doc.walletAddress}`);
    }
  }

  // 2. Ensure patient30 and patient1 have unique wallets
  const patient30 = await User.findOne({ email: 'patient30@mediconsent.com' });
  const patient1 = await User.findOne({ email: 'patient1@mediconsent.com' });
  
  if (patient30 && !patient30.walletAddress) {
    const p30Wallet = ethers.Wallet.createRandom().address;
    await User.updateOne({ _id: patient30._id }, { $set: { walletAddress: p30Wallet } });
    console.log(`Updated Patient 30 wallet: ${p30Wallet}`);
  }

  if (patient1 && !patient1.walletAddress) {
    const p1Wallet = ethers.Wallet.createRandom().address;
    await User.updateOne({ _id: patient1._id }, { $set: { walletAddress: p1Wallet } });
    console.log(`Updated Patient 1 wallet: ${p1Wallet}`);
  }

  // 3. Seed active Consent for Dr. Amit Joshi and Aakanksha Malhotra (patient30)
  const drAmit = await User.findOne({ email: 'doctor3@mediconsent.com' });
  const recordPatient30 = await MedicalRecord.findOne({ patientId: patient30._id });

  if (patient30 && drAmit && recordPatient30) {
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const consentId = '0x' + crypto.randomBytes(32).toString('hex');

    const consent30 = await Consent.findOneAndUpdate(
      { doctorId: drAmit._id, patientId: patient30._id, authorizedRecords: recordPatient30._id },
      {
        doctorId: drAmit._id,
        patientId: patient30._id,
        authorizedRecords: [recordPatient30._id],
        purpose: 'Orthopedic consultation and clinical evaluation',
        status: 'active',
        grantedAt: new Date(),
        expiresAt: expiry,
        blockchainConsentId: consentId,
        transactionHash: txHash,
        chainId: 31337,
      },
      { upsert: true, new: true }
    );
    console.log(`Active consent created for Dr. Amit Joshi & Aakanksha Malhotra -> Record: "${recordPatient30.recordTitle}" (Consent ID: ${consent30._id})`);

    await AccessRequest.updateMany(
      { doctorId: drAmit._id, patientId: patient30._id, status: { $in: ['pending', 'approved'] } },
      { $set: { status: 'approved', requestedRecords: [recordPatient30._id] } }
    );
  }

  // 4. Seed active Consent for Dr. Rajesh Kumar and Aarav Patel (patient1)
  const drRajesh = await User.findOne({ email: 'doctor1@mediconsent.com' });
  const recordPatient1 = await MedicalRecord.findOne({ patientId: patient1._id });

  if (patient1 && drRajesh && recordPatient1) {
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const consentId = '0x' + crypto.randomBytes(32).toString('hex');

    const consent1 = await Consent.findOneAndUpdate(
      { doctorId: drRajesh._id, patientId: patient1._id, authorizedRecords: recordPatient1._id },
      {
        doctorId: drRajesh._id,
        patientId: patient1._id,
        authorizedRecords: [recordPatient1._id],
        purpose: 'Routine clinical consultation and health evaluation (Cardiology)',
        status: 'active',
        grantedAt: new Date(),
        expiresAt: expiry,
        blockchainConsentId: consentId,
        transactionHash: txHash,
        chainId: 31337,
      },
      { upsert: true, new: true }
    );
    console.log(`Active consent created for Dr. Rajesh Kumar & Aarav Patel -> Record: "${recordPatient1.recordTitle}" (Consent ID: ${consent1._id})`);

    await AccessRequest.updateMany(
      { doctorId: drRajesh._id, patientId: patient1._id, status: { $in: ['pending', 'approved'] } },
      { $set: { status: 'approved', requestedRecords: [recordPatient1._id] } }
    );
  }

  await mongoose.disconnect();
  console.log('SUCCESS: All doctor wallets and active consents linked!');
}

run().catch(console.error);
