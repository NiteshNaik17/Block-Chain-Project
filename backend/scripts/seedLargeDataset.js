/**
 * Comprehensive Database Seeder:
 * - 10 Verified Doctors
 * - 50 Patients
 * - Platform Administrator
 * - 120 Appointments / Access Requests:
 *     - 3 Doctors x 10 appointments = 30
 *     - 5 Doctors x 12 appointments = 60
 *     - 2 Doctors x 15 appointments = 30
 */
import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

import env from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import AccessRequest from '../models/AccessRequest.js';
import { hashPassword } from '../utils/password.js';

const FIRST_NAMES_MALE = [
  'Aarav', 'Rohan', 'Vikram', 'Arjun', 'Kabir', 'Aditya', 'Siddharth', 'Varun', 'Nikhil', 'Dev',
  'Manish', 'Kunal', 'Harsh', 'Gaurav', 'Pranav', 'Rishi', 'Abhishek', 'Tarun', 'Deepak', 'Sanjay',
  'Sameer', 'Ashwin', 'Yash', 'Mayank', 'Alok'
];

const FIRST_NAMES_FEMALE = [
  'Ananya', 'Priya', 'Sneha', 'Divya', 'Ritu', 'Pooja', 'Neha', 'Shreya', 'Tanvi', 'Isha',
  'Kavya', 'Simran', 'Meera', 'Roshni', 'Aakanksha', 'Swati', 'Aditi', 'Payal', 'Bhavna', 'Geeta',
  'Nandini', 'Pallavi', 'Rekha', 'Sonal', 'Vidya'
];

const LAST_NAMES = [
  'Patel', 'Sharma', 'Verma', 'Nair', 'Malhotra', 'Kulkarni', 'Reddy', 'Menon', 'Das', 'Sengupta',
  'Chopra', 'Bhatia', 'Deshmukh', 'Joshi', 'Mehta', 'Gupta', 'Iyer', 'Pillai', 'Rao', 'Pandey',
  'Mishra', 'Saxena', 'Mukherjee', 'Banerjee', 'Kapoor'
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow'];

const DOCTOR_SPECIALTIES = [
  { spec: 'Cardiology', hospital: 'Apollo Hospitals, Chennai', reg: 'MCI-2015-10001', name: 'Dr. Rajesh Kumar' },
  { spec: 'Neurology', hospital: 'Fortis Memorial, Gurugram', reg: 'MCI-2016-10002', name: 'Dr. Sunita Rao' },
  { spec: 'Orthopedics', hospital: 'Max Super Speciality, New Delhi', reg: 'MCI-2017-10003', name: 'Dr. Amit Joshi' },
  { spec: 'Pediatrics', hospital: 'Lilavati Hospital, Mumbai', reg: 'MCI-2018-10004', name: 'Dr. Kavita Deshmukh' },
  { spec: 'Oncology', hospital: 'Tata Memorial Centre, Mumbai', reg: 'MCI-2014-10005', name: 'Dr. Sanjay Gupta' },
  { spec: 'Gynecology', hospital: 'Manipal Hospital, Bengaluru', reg: 'MCI-2019-10006', name: 'Dr. Meenakshi Sundaram' },
  { spec: 'General Medicine', hospital: 'AIIMS, New Delhi', reg: 'MCI-2013-10007', name: 'Dr. Vikramaditya Singh' },
  { spec: 'Dermatology', hospital: 'Kokilaben Ambani Hospital, Mumbai', reg: 'MCI-2020-10008', name: 'Dr. Pooja Chawla' },
  { spec: 'Psychiatry', hospital: 'NIMHANS, Bengaluru', reg: 'MCI-2012-10009', name: 'Dr. Tariq Mansoor' },
  { spec: 'Ophthalmology', hospital: 'Sankara Nethralaya, Chennai', reg: 'MCI-2021-10010', name: 'Dr. Shweta Mukherjee' },
];

const CLINICAL_PURPOSES = [
  'Routine clinical consultation and health evaluation',
  'Follow-up review of diagnostic laboratory reports',
  'Cardiology consultation and echocardiogram review',
  'Pre-operative medical clearance and records review',
  'Comprehensive wellness exam and medication adjustment',
  'Management of chronic hypertension and diabetes profile',
  'Post-discharge evaluation and clinical follow-up',
  'Second opinion regarding treatment recommendations',
  'Specialist evaluation for recurrent symptoms',
  'Diagnostic investigation and prescription renewal',
];

async function seed() {
  const uri = process.env.MONGODB_URI || env.mongoUri;
  if (!uri) {
    console.error('[seed] MONGODB_URI is not set.');
    process.exit(1);
  }

  await connectDB(uri);
  console.log('[seed] Connected to MongoDB Atlas. Seeding data...');

  const doctorPasswordHash = await hashPassword('Doctor@123');
  const patientPasswordHash = await hashPassword('Patient@123');
  const adminPasswordHash = await hashPassword('AdminPassword123!');

  // 1. Seed Administrator
  const adminEmail = 'admin@mediconsent.local';
  const adminData = {
    fullName: 'MediConsent Administrator',
    email: adminEmail,
    mobileNumber: '+91 98765 00000',
    passwordHash: adminPasswordHash,
    role: 'admin',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
  };
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create(adminData);
  } else {
    await User.updateOne({ email: adminEmail }, { $set: adminData });
  }
  console.log('✓ Administrator account verified: admin@mediconsent.local');

  // 2. Seed 10 Doctors
  const doctorDocs = [];
  for (let i = 0; i < DOCTOR_SPECIALTIES.length; i++) {
    const d = DOCTOR_SPECIALTIES[i];
    const email = `doctor${i + 1}@mediconsent.com`;
    const docData = {
      fullName: d.name,
      email,
      mobileNumber: `+91 9810${i} 0${i}00${i + 1}`,
      passwordHash: doctorPasswordHash,
      role: 'doctor',
      accountStatus: 'active',
      verificationStatus: 'verified',
      specialization: d.spec,
      hospitalName: d.hospital,
      medicalRegistrationNumber: d.reg,
    };
    let doc = await User.findOne({ email });
    if (!doc) {
      doc = await User.create(docData);
    } else {
      await User.updateOne({ email }, { $set: docData });
      doc = await User.findOne({ email });
    }
    doctorDocs.push(doc);
  }
  console.log(`✓ 10 Verified Doctors seeded (doctor1@mediconsent.com through doctor10@mediconsent.com)`);

  // 3. Seed 50 Patients
  const patientDocs = [];
  for (let i = 0; i < 50; i++) {
    const isMale = i % 2 === 0;
    const firstName = isMale
      ? FIRST_NAMES_MALE[Math.floor(i / 2) % FIRST_NAMES_MALE.length]
      : FIRST_NAMES_FEMALE[Math.floor(i / 2) % FIRST_NAMES_FEMALE.length];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    const fullName = `${firstName} ${lastName}`;
    const email = `patient${i + 1}@mediconsent.com`;
    const city = CITIES[i % CITIES.length];
    const bloodGroup = BLOOD_GROUPS[i % BLOOD_GROUPS.length];
    const birthYear = 1970 + (i % 35);
    const birthMonth = String((i % 12) + 1).padStart(2, '0');
    const birthDay = String((i % 28) + 1).padStart(2, '0');

    const patientData = {
      fullName,
      email,
      mobileNumber: `+91 98200 ${String(10000 + i).slice(0, 5)}`,
      passwordHash: patientPasswordHash,
      role: 'patient',
      accountStatus: 'active',
      verificationStatus: 'not_applicable',
      gender: isMale ? 'male' : 'female',
      dateOfBirth: new Date(`${birthYear}-${birthMonth}-${birthDay}`),
      bloodGroup,
      address: `${(i + 1) * 7} Main Road, ${city}`,
      emergencyContact: `${isMale ? 'Pooja' : 'Rahul'} ${lastName} - +91 98200 999${String(i).padStart(2, '0')}`,
    };
    let patient = await User.findOne({ email });
    if (!patient) {
      patient = await User.create(patientData);
    } else {
      await User.updateOne({ email }, { $set: patientData });
      patient = await User.findOne({ email });
    }
    patientDocs.push(patient);
  }
  console.log(`✓ 50 Patients seeded (patient1@mediconsent.com through patient50@mediconsent.com)`);

  // 4. Seed Appointments / Access Requests
  // Distribution requested:
  // - 3 doctors: 10 appointments each = 30
  // - 5 doctors: 12 appointments each = 60
  // - 2 doctors: 15 appointments each = 30
  // Total = 120 appointments
  const appointmentPlan = [
    { doctorIndex: 0, count: 10 },
    { doctorIndex: 1, count: 10 },
    { doctorIndex: 2, count: 10 },
    { doctorIndex: 3, count: 12 },
    { doctorIndex: 4, count: 12 },
    { doctorIndex: 5, count: 12 },
    { doctorIndex: 6, count: 12 },
    { doctorIndex: 7, count: 12 },
    { doctorIndex: 8, count: 15 },
    { doctorIndex: 9, count: 15 },
  ];

  await AccessRequest.deleteMany({});
  console.log('✓ Cleaned previous access requests / appointments');

  let totalAppointments = 0;
  let patientPointer = 0;

  for (const plan of appointmentPlan) {
    const doctor = doctorDocs[plan.doctorIndex];
    for (let k = 0; k < plan.count; k++) {
      const patient = patientDocs[patientPointer % patientDocs.length];
      patientPointer++;

      const categoryOptions = [
        ['Prescription', 'Laboratory Report'],
        ['Laboratory Report', 'X-ray Report'],
        ['Prescription', 'Discharge Summary'],
        ['MRI / CT Scan Report'],
        ['Laboratory Report'],
      ];
      const categories = categoryOptions[k % categoryOptions.length];
      const purpose = CLINICAL_PURPOSES[(k + plan.doctorIndex) % CLINICAL_PURPOSES.length];
      const statuses = ['pending', 'approved', 'approved', 'pending'];
      const status = statuses[(k + plan.doctorIndex) % statuses.length];

      await AccessRequest.create({
        patientId: patient._id,
        doctorId: doctor._id,
        requestedCategories: categories,
        purpose: `${purpose} (${doctor.specialization})`,
        requestedDuration: 15 + ((k % 4) * 15),
        status,
        patientResponseDate: status === 'approved' ? new Date() : null,
      });
      totalAppointments++;
    }
  }

  console.log(`✓ Created ${totalAppointments} appointments across the 10 doctors:`);
  console.log(`    - 3 doctors with 10 appointments each (30)`);
  console.log(`    - 5 doctors with 12 appointments each (60)`);
  console.log(`    - 2 doctors with 15 appointments each (30)`);
  console.log('[seed] All data successfully populated in MongoDB Atlas!');
}

seed()
  .catch((err) => {
    console.error('[seed] Error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB().catch(() => {});
  });
