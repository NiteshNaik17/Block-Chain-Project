# MediConsent – Test & Demo Accounts

This document contains credentials and details for **10 Patients** and **10 Doctors** (plus Administrator) for evaluation, demonstration, and end-to-end testing.

---

## 🔑 Common Password Scheme
- **Patients Password:** `Patient@123`
- **Doctors Password:** `Doctor@123`
- **Administrator Password:** `AdminPassword123!`

---

## 👨‍⚕️ 10 Verified Doctor Accounts
*All doctor accounts are pre-configured with **Verified** status and **Active** state.*

| # | Doctor Name | Email (Login ID) | Password | Specialization | Hospital | Reg Number | Mobile Number |
|---|-------------|------------------|----------|----------------|----------|------------|---------------|
| 1 | **Dr. Rajesh Kumar** | `dr.rajesh.kumar@example.com` | `Doctor@123` | Cardiology | Apollo Hospitals, Chennai | `MCI-2015-10001` | +91 98101 01001 |
| 2 | **Dr. Sunita Rao** | `dr.sunita.rao@example.com` | `Doctor@123` | Neurology | Fortis Memorial Research, Gurugram | `MCI-2016-10002` | +91 98102 02002 |
| 3 | **Dr. Amit Joshi** | `dr.amit.joshi@example.com` | `Doctor@123` | Orthopedics | Max Super Speciality, New Delhi | `MCI-2017-10003` | +91 98103 03003 |
| 4 | **Dr. Kavita Deshmukh** | `dr.kavita.deshmukh@example.com` | `Doctor@123` | Pediatrics | Lilavati Hospital, Mumbai | `MCI-2018-10004` | +91 98104 04004 |
| 5 | **Dr. Sanjay Gupta** | `dr.sanjay.gupta@example.com` | `Doctor@123` | Oncology | Tata Memorial Centre, Mumbai | `MCI-2014-10005` | +91 98105 05005 |
| 6 | **Dr. Meenakshi Sundaram** | `dr.meenakshi.s@example.com` | `Doctor@123` | Gynecology | Manipal Hospital, Bengaluru | `MCI-2019-10006` | +91 98106 06006 |
| 7 | **Dr. Vikramaditya Singh** | `dr.vikram.singh@example.com` | `Doctor@123` | General Medicine | AIIMS, New Delhi | `MCI-2013-10007` | +91 98107 07007 |
| 8 | **Dr. Pooja Chawla** | `dr.pooja.chawla@example.com` | `Doctor@123` | Dermatology | Kokilaben Ambani Hospital, Mumbai | `MCI-2020-10008` | +91 98108 08008 |
| 9 | **Dr. Tariq Mansoor** | `dr.tariq.mansoor@example.com` | `Doctor@123` | Psychiatry | NIMHANS, Bengaluru | `MCI-2012-10009` | +91 98109 09009 |
| 10 | **Dr. Shweta Mukherjee** | `dr.shweta.m@example.com` | `Doctor@123` | Ophthalmology | Sankara Nethralaya, Chennai | `MCI-2021-10010` | +91 98110 10010 |

---

## 🏥 10 Patient Accounts
*All patient accounts are pre-configured with **Active** state.*

| # | Patient Name | Email (Login ID) | Password | Blood Group | Gender | Date of Birth | Mobile Number | Address |
|---|--------------|------------------|----------|-------------|--------|---------------|---------------|---------|
| 1 | **Aarav Patel** | `aarav.patel@example.com` | `Patient@123` | O+ | Male | 1990-05-15 | +91 98201 11001 | 12 Lotus Colony, Bandra West, Mumbai 400050 |
| 2 | **Ananya Sharma** | `ananya.sharma@example.com` | `Patient@123` | A+ | Female | 1994-03-22 | +91 98200 41235 | 42 Palm Grove Residency, Andheri West, Mumbai 400053 |
| 3 | **Rohan Verma** | `rohan.verma@example.com` | `Patient@123` | B+ | Male | 1985-11-08 | +91 98202 22003 | 7 Green Acres, Koramangala, Bengaluru 560034 |
| 4 | **Priya Nair** | `priya.nair@example.com` | `Patient@123` | AB+ | Female | 1992-07-19 | +91 98203 33005 | 104 Marine Drive, Nariman Point, Mumbai 400021 |
| 5 | **Vikram Malhotra** | `vikram.malhotra@example.com` | `Patient@123` | O- | Male | 1988-01-30 | +91 98204 44007 | 55 Shanti Niketan, New Delhi 110021 |
| 6 | **Sneha Kulkarni** | `sneha.kulkarni@example.com` | `Patient@123` | A- | Female | 1996-09-12 | +91 98205 55009 | 18 Shivaji Nagar, Pune 411005 |
| 7 | **Arjun Reddy** | `arjun.reddy@example.com` | `Patient@123` | B- | Male | 1993-04-25 | +91 98206 66011 | 88 Jubilee Hills, Hyderabad 500033 |
| 8 | **Divya Menon** | `divya.menon@example.com` | `Patient@123` | AB- | Female | 1991-12-03 | +91 98207 77013 | 23 Panampilly Nagar, Kochi 682036 |
| 9 | **Kabir Das** | `kabir.das@example.com` | `Patient@123` | O+ | Male | 1982-08-14 | +91 98208 88015 | 9 Park Street, Kolkata 700016 |
| 10 | **Ritu Sengupta** | `ritu.sengupta@example.com` | `Patient@123` | B+ | Female | 1995-02-18 | +91 98209 99017 | 31 Salt Lake Sector V, Kolkata 700091 |

---

## 🛡️ Platform Administrator Account

| Name | Email (Login ID) | Password | Role |
|------|------------------|----------|------|
| **MediConsent Administrator** | `admin@mediconsent.local` | `AdminPassword123!` | Administrator |

---

## ⚡ How to Seed into MongoDB
To insert or sync all these accounts into your MongoDB database, run:
```bash
cd backend
npm run seed:users
```
Or with an explicit MongoDB URI (such as MongoDB Atlas):
```bash
cd backend
MONGODB_URI="<your-mongodb-atlas-uri>" npm run seed:users
```
