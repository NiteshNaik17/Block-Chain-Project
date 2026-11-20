/**
 * Database seeder for 10 Patients and 10 Doctors.
 *
 * Usage:
 *   npm run seed:users
 *
 * Or with an explicit MongoDB URI:
 *   MONGODB_URI="mongodb+srv://..." node scripts/seedUsers.js
 */
import env from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';

export const PATIENTS_DATA = [
  {
    fullName: 'Aarav Patel',
    email: 'aarav.patel@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98201 11001',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'male',
    dateOfBirth: new Date('1990-05-15'),
    bloodGroup: 'O+',
    address: '12 Lotus Colony, Bandra West, Mumbai 400050',
    emergencyContact: 'Pooja Patel - +91 98201 11002',
  },
  {
    fullName: 'Ananya Sharma',
    email: 'ananya.sharma@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98200 41235',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'female',
    dateOfBirth: new Date('1994-03-22'),
    bloodGroup: 'A+',
    address: '42 Palm Grove Residency, Andheri West, Mumbai 400053',
    emergencyContact: 'Rahul Sharma - +91 98200 55781',
  },
  {
    fullName: 'Rohan Verma',
    email: 'rohan.verma@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98202 22003',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'male',
    dateOfBirth: new Date('1985-11-08'),
    bloodGroup: 'B+',
    address: '7 Green Acres, Koramangala, Bengaluru 560034',
    emergencyContact: 'Sunita Verma - +91 98202 22004',
  },
  {
    fullName: 'Priya Nair',
    email: 'priya.nair@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98203 33005',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'female',
    dateOfBirth: new Date('1992-07-19'),
    bloodGroup: 'AB+',
    address: '104 Marine Drive, Nariman Point, Mumbai 400021',
    emergencyContact: 'Kiran Nair - +91 98203 33006',
  },
  {
    fullName: 'Vikram Malhotra',
    email: 'vikram.malhotra@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98204 44007',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'male',
    dateOfBirth: new Date('1988-01-30'),
    bloodGroup: 'O-',
    address: '55 Shanti Niketan, New Delhi 110021',
    emergencyContact: 'Neha Malhotra - +91 98204 44008',
  },
  {
    fullName: 'Sneha Kulkarni',
    email: 'sneha.kulkarni@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98205 55009',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'female',
    dateOfBirth: new Date('1996-09-12'),
    bloodGroup: 'A-',
    address: '18 Shivaji Nagar, Pune 411005',
    emergencyContact: 'Amit Kulkarni - +91 98205 55010',
  },
  {
    fullName: 'Arjun Reddy',
    email: 'arjun.reddy@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98206 66011',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'male',
    dateOfBirth: new Date('1993-04-25'),
    bloodGroup: 'B-',
    address: '88 Jubilee Hills, Hyderabad 500033',
    emergencyContact: 'Sujata Reddy - +91 98206 66012',
  },
  {
    fullName: 'Divya Menon',
    email: 'divya.menon@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98207 77013',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'female',
    dateOfBirth: new Date('1991-12-03'),
    bloodGroup: 'AB-',
    address: '23 Panampilly Nagar, Kochi 682036',
    emergencyContact: 'Gopal Menon - +91 98207 77014',
  },
  {
    fullName: 'Kabir Das',
    email: 'kabir.das@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98208 88015',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'male',
    dateOfBirth: new Date('1982-08-14'),
    bloodGroup: 'O+',
    address: '9 Park Street, Kolkata 700016',
    emergencyContact: 'Meera Das - +91 98208 88016',
  },
  {
    fullName: 'Ritu Sengupta',
    email: 'ritu.sengupta@example.com',
    password: 'Patient@123',
    mobileNumber: '+91 98209 99017',
    role: 'patient',
    accountStatus: 'active',
    verificationStatus: 'not_applicable',
    gender: 'female',
    dateOfBirth: new Date('1995-02-18'),
    bloodGroup: 'B+',
    address: '31 Salt Lake Sector V, Kolkata 700091',
    emergencyContact: 'Debashis Sengupta - +91 98209 99018',
  },
];

export const DOCTORS_DATA = [
  {
    fullName: 'Dr. Rajesh Kumar',
    email: 'dr.rajesh.kumar@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98101 01001',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2015-10001',
    specialization: 'Cardiology',
    hospitalName: 'Apollo Hospitals, Chennai',
  },
  {
    fullName: 'Dr. Sunita Rao',
    email: 'dr.sunita.rao@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98102 02002',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2016-10002',
    specialization: 'Neurology',
    hospitalName: 'Fortis Memorial Research Institute, Gurugram',
  },
  {
    fullName: 'Dr. Amit Joshi',
    email: 'dr.amit.joshi@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98103 03003',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2017-10003',
    specialization: 'Orthopedics',
    hospitalName: 'Max Super Speciality Hospital, New Delhi',
  },
  {
    fullName: 'Dr. Kavita Deshmukh',
    email: 'dr.kavita.deshmukh@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98104 04004',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2018-10004',
    specialization: 'Pediatrics',
    hospitalName: 'Lilavati Hospital & Research Centre, Mumbai',
  },
  {
    fullName: 'Dr. Sanjay Gupta',
    email: 'dr.sanjay.gupta@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98105 05005',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2014-10005',
    specialization: 'Oncology',
    hospitalName: 'Tata Memorial Centre, Mumbai',
  },
  {
    fullName: 'Dr. Meenakshi Sundaram',
    email: 'dr.meenakshi.s@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98106 06006',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2019-10006',
    specialization: 'Gynecology',
    hospitalName: 'Manipal Hospital, Bengaluru',
  },
  {
    fullName: 'Dr. Vikramaditya Singh',
    email: 'dr.vikram.singh@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98107 07007',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2013-10007',
    specialization: 'General Medicine',
    hospitalName: 'AIIMS, New Delhi',
  },
  {
    fullName: 'Dr. Pooja Chawla',
    email: 'dr.pooja.chawla@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98108 08008',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2020-10008',
    specialization: 'Dermatology',
    hospitalName: 'Kokilaben Dhirubhai Ambani Hospital, Mumbai',
  },
  {
    fullName: 'Dr. Tariq Mansoor',
    email: 'dr.tariq.mansoor@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98109 09009',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2012-10009',
    specialization: 'Psychiatry',
    hospitalName: 'NIMHANS, Bengaluru',
  },
  {
    fullName: 'Dr. Shweta Mukherjee',
    email: 'dr.shweta.m@example.com',
    password: 'Doctor@123',
    mobileNumber: '+91 98110 10010',
    role: 'doctor',
    accountStatus: 'active',
    verificationStatus: 'verified',
    medicalRegistrationNumber: 'MCI-2021-10010',
    specialization: 'Ophthalmology',
    hospitalName: 'Sankara Nethralaya, Chennai',
  },
];

async function seedUsers() {
  const uri = process.env.MONGODB_URI || env.mongoUri;
  if (!uri) {
    console.error('[seedUsers] MONGODB_URI is not configured in the environment.');
    console.error('Provide it via .env or CLI: MONGODB_URI="your-uri" npm run seed:users');
    process.exitCode = 1;
    return;
  }

  await connectDB(uri);

  console.log('[seedUsers] Seeding 10 Patients and 10 Doctors into MediConsent...');

  let createdPatients = 0;
  let updatedPatients = 0;
  for (const patient of PATIENTS_DATA) {
    const { password, ...fields } = patient;
    const passwordHash = await hashPassword(password);
    const existing = await User.findOne({ email: fields.email });
    if (!existing) {
      await User.create({ ...fields, passwordHash });
      createdPatients++;
    } else {
      await User.updateOne({ email: fields.email }, { $set: { ...fields, passwordHash } });
      updatedPatients++;
    }
  }

  let createdDoctors = 0;
  let updatedDoctors = 0;
  for (const doctor of DOCTORS_DATA) {
    const { password, ...fields } = doctor;
    const passwordHash = await hashPassword(password);
    const existing = await User.findOne({ email: fields.email });
    if (!existing) {
      await User.create({ ...fields, passwordHash });
      createdDoctors++;
    } else {
      await User.updateOne({ email: fields.email }, { $set: { ...fields, passwordHash } });
      updatedDoctors++;
    }
  }

  console.log(`[seedUsers] Patients: ${createdPatients} created, ${updatedPatients} updated.`);
  console.log(`[seedUsers] Doctors: ${createdDoctors} created, ${updatedDoctors} updated.`);
  console.log('[seedUsers] Seeding completed successfully!');
}

seedUsers()
  .catch((err) => {
    console.error('[seedUsers] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB().catch(() => {});
  });
