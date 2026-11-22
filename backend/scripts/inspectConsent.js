import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from '../models/User.js';
import MedicalRecord from '../models/MedicalRecord.js';
import AccessRequest from '../models/AccessRequest.js';
import Consent from '../models/Consent.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const records = await MedicalRecord.find().lean();
  console.log('Records count:', records.length);
  for (const r of records) {
    console.log(`Record: ${r._id} | Title: ${r.recordTitle} | Patient: ${r.patientId} | Status: ${r.recordStatus}`);
  }

  const consents = await Consent.find().lean();
  console.log('Consents count:', consents.length);
  for (const c of consents) {
    console.log(`Consent: ${c._id} | Doctor: ${c.doctorId} | Patient: ${c.patientId} | Status: ${c.status} | TxHash: ${c.transactionHash}`);
  }

  const approvedRequests = await AccessRequest.find({ status: 'approved' }).lean();
  console.log('Approved requests count:', approvedRequests.length);

  await mongoose.disconnect();
}

run().catch(console.error);
