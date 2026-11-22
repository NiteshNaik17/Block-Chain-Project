import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import MedicalRecord from '../models/MedicalRecord.js';
import Consent from '../models/Consent.js';
import { storeEncryptedFile } from '../services/secureFile.service.js';

// Simple valid minimal PDF buffer with actual text content
function createMinimalPdf(title, patientName, doctorName) {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 200 >>
stream
BT
/F1 18 Tf
50 720 Td
(MEDICONSENT - CLINICAL MEDICAL RECORD) Tj
/F1 12 Tf
0 -30 Td
(Title: ${title}) Tj
0 -20 Td
(Patient: ${patientName}) Tj
0 -20 Td
(Consultant: ${doctorName}) Tj
0 -30 Td
(Diagnosis: Acute viral pyrexia / fever with mild fatigue) Tj
0 -20 Td
(Prescription: Paracetamol 650mg TDS x 3 days, adequate hydration) Tj
0 -20 Td
(Integrity: AES-256-GCM Zero-Knowledge Encrypted) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000494 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
563
%%EOF`;
  return Buffer.from(content, 'utf-8');
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to Atlas DB');

  const records = await MedicalRecord.find().populate('patientId', 'fullName email').lean();
  console.log(`Found ${records.length} records in database.`);

  for (const record of records) {
    const patientName = record.patientId?.fullName || 'Patient';
    const doctorName = record.doctorName || 'Attending Physician';
    const pdfBuffer = createMinimalPdf(record.recordTitle, patientName, doctorName);

    const stored = await storeEncryptedFile({ buffer: pdfBuffer, scope: 'records' });

    await MedicalRecord.updateOne(
      { _id: record._id },
      {
        $set: {
          fileReference: stored.fileReference,
          integrityHash: stored.integrityHash,
          encryptionIv: stored.encryptionIv,
          authTag: stored.authTag,
          encryptionAlgorithm: stored.encryptionAlgorithm,
          encryptionVersion: stored.encryptionVersion,
          encryptedData: stored.encryptedData,
          fileSize: stored.fileSize,
          mimeType: 'application/pdf',
          originalFileName: `${record.recordTitle.toLowerCase().replace(/\s+/g, '_')}_report.pdf`,
        },
      }
    );

    console.log(`Updated record ${record._id} ("${record.recordTitle}") for ${patientName} with persistent encryptedData (${stored.fileSize} bytes)`);
  }

  // Ensure all active consents have the correct record IDs authorized
  const consents = await Consent.find({ status: 'active' });
  for (const c of consents) {
    const matchingRecords = await MedicalRecord.find({ patientId: c.patientId }).select('_id');
    const recordIds = matchingRecords.map((r) => r._id);
    if (recordIds.length > 0) {
      await Consent.updateOne({ _id: c._id }, { $set: { authorizedRecords: recordIds } });
      console.log(`Updated Consent ${c._id} to authorize ${recordIds.length} records.`);
    }
  }

  await mongoose.disconnect();
  console.log('SUCCESS: All records seeded with persistent encrypted PDF payloads!');
}

run().catch(console.error);
