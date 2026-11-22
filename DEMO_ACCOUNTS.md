# MediConsent – Test & Demo Accounts

All credentials below have been inserted and populated directly into your **MongoDB Atlas** database (`mediconsent` database).

---

## 🔑 Common Password Scheme
- **Patients Password:** `Patient@123`
- **Doctors Password:** `Doctor@123`
- **Administrator Password:** `AdminPassword123!`

---

## 👨‍⚕️ 10 Verified Doctors & Appointment Distribution

| # | Doctor Name | Email (Login ID) | Password | Specialization | Hospital / Clinic | Medical Reg # | Appointments Assigned |
|---|-------------|------------------|----------|----------------|-------------------|---------------|-----------------------|
| 1 | **Dr. Rajesh Kumar** | `doctor1@mediconsent.com` | `Doctor@123` | Cardiology | Apollo Hospitals, Chennai | `MCI-2015-10001` | **10 appointments** |
| 2 | **Dr. Sunita Rao** | `doctor2@mediconsent.com` | `Doctor@123` | Neurology | Fortis Memorial, Gurugram | `MCI-2016-10002` | **10 appointments** |
| 3 | **Dr. Amit Joshi** | `doctor3@mediconsent.com` | `Doctor@123` | Orthopedics | Max Super Speciality, New Delhi | `MCI-2017-10003` | **10 appointments** |
| 4 | **Dr. Kavita Deshmukh** | `doctor4@mediconsent.com` | `Doctor@123` | Pediatrics | Lilavati Hospital, Mumbai | `MCI-2018-10004` | **12 appointments** |
| 5 | **Dr. Sanjay Gupta** | `doctor5@mediconsent.com` | `Doctor@123` | Oncology | Tata Memorial Centre, Mumbai | `MCI-2014-10005` | **12 appointments** |
| 6 | **Dr. Meenakshi Sundaram** | `doctor6@mediconsent.com` | `Doctor@123` | Gynecology | Manipal Hospital, Bengaluru | `MCI-2019-10006` | **12 appointments** |
| 7 | **Dr. Vikramaditya Singh** | `doctor7@mediconsent.com` | `Doctor@123` | General Medicine | AIIMS, New Delhi | `MCI-2013-10007` | **12 appointments** |
| 8 | **Dr. Pooja Chawla** | `doctor8@mediconsent.com` | `Doctor@123` | Dermatology | Kokilaben Ambani Hospital, Mumbai | `MCI-2020-10008` | **12 appointments** |
| 9 | **Dr. Tariq Mansoor** | `doctor9@mediconsent.com` | `Doctor@123` | Psychiatry | NIMHANS, Bengaluru | `MCI-2012-10009` | **15 appointments** |
| 10 | **Dr. Shweta Mukherjee** | `doctor10@mediconsent.com` | `Doctor@123` | Ophthalmology | Sankara Nethralaya, Chennai | `MCI-2021-10010` | **15 appointments** |

**Total Doctor Appointments:** `(3 × 10) + (5 × 12) + (2 × 15) = 30 + 60 + 30 = 120 Appointments / Access Requests`.

---

## 🏥 50 Patient Accounts (Summary)
*All patients use password `Patient@123`.*

| Range | Emails | Password | Account Status |
|-------|--------|----------|----------------|
| **Patient 1 to 50** | `patient1@mediconsent.com` to `patient50@mediconsent.com` | `Patient@123` | **Active** |

### Sample Patient Details:
- **Patient 1**: Aarav Patel (`patient1@mediconsent.com`) – Blood: O+, Male, Mumbai
- **Patient 2**: Ananya Sharma (`patient2@mediconsent.com`) – Blood: A+, Female, Delhi
- **Patient 3**: Rohan Verma (`patient3@mediconsent.com`) – Blood: B+, Male, Bengaluru
- **Patient 4**: Priya Nair (`patient4@mediconsent.com`) – Blood: AB+, Female, Hyderabad
- **Patient 5**: Vikram Malhotra (`patient5@mediconsent.com`) – Blood: O-, Male, Chennai
*(...continuing up to `patient50@mediconsent.com` with complete profiles, DOBs, emergency contacts, and phone numbers).*

---

## 🛡️ Platform Administrator
- **Email:** `admin@mediconsent.local`
- **Password:** `AdminPassword123!`

---

## 🔍 Where Can You See This Data?

1. **In the Web App (Live UI)**:
   - **As a Doctor**: Log in with any doctor email (`doctor1@mediconsent.com` ... `doctor10@mediconsent.com`) and password `Doctor@123`. Click **"My Requests"** or **"Patients"** in the sidebar to see their assigned appointments/access requests and patient list!
   - **As a Patient**: Log in with any patient email (`patient1@mediconsent.com` ... `patient50@mediconsent.com`) and password `Patient@123`. Click **"Doctor Requests"** in the sidebar to see the access requests received from doctors waiting for approval or approved!
   - **As an Administrator**: Log in with `admin@mediconsent.local` and password `AdminPassword123!`. Click **"Manage Patients"** (you will see all 50 patients) and **"Verify Doctors"** / **"Manage Users"** (you will see all 10 verified doctors).

2. **In MongoDB Atlas (Database Web Console)**:
   - Go to [MongoDB Atlas](https://cloud.mongodb.com/).
   - Click on your cluster (`Cluster0`) ➔ **"Browse Collections"**.
   - Select the **`mediconsent`** database:
     - `users` collection: Contains **61 documents** (50 patients + 10 doctors + 1 admin).
     - `accessrequests` collection: Contains **120 documents** (all appointments/requests).
