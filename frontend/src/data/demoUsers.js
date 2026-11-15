/**
 * Demo identities used to preview the three portals before authentication
 * is implemented (Phase 4). These are synthetic characters — no real people.
 */

export const demoPatient = {
  id: 'PT-100148',
  role: 'patient',
  name: 'Ananya Sharma',
  email: 'ananya.sharma@example.com',
  phone: '+91 98200 41235',
  bloodGroup: 'O+',
  dateOfBirth: '1994-03-22',
  gender: 'Female',
  address: '42 Palm Grove Residency, Andheri West, Mumbai 400053',
  emergencyContact: 'Rahul Sharma — +91 98200 55781',
  walletAddress: null,
};

export const demoDoctor = {
  id: 'DR-200317',
  role: 'doctor',
  name: 'Dr. Rohan Mehta',
  email: 'rohan.mehta@example.com',
  phone: '+91 98195 77342',
  registrationNumber: 'MCI-2016-44821',
  specialization: 'Cardiology',
  hospital: 'Sunrise Multispeciality Hospital, Mumbai',
  verificationStatus: 'Verified',
  registeredAt: '2024-08-14',
  walletAddress: null,
};

export const demoAdmin = {
  id: 'AD-000001',
  role: 'admin',
  name: 'Priya Nair',
  email: 'admin@mediconsent.local',
  designation: 'Platform Administrator',
  walletAddress: null,
};

export const demoUsers = {
  patient: demoPatient,
  doctor: demoDoctor,
  admin: demoAdmin,
};

export default demoUsers;
