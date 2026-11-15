import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BadgeCheck, Clock, FileText, LogOut, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import AuthLayout from '../../layouts/AuthLayout';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import FileUpload from '../../components/forms/FileUpload';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/format';
import { isVerifiedDoctor } from '../../utils/roles';
import { fetchCertificateStatus, uploadCertificate } from '../../services/doctorService';

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <dt className="text-amber-700">{label}</dt>
      <dd className="truncate font-medium text-amber-900">{value || '—'}</dd>
    </div>
  );
}

/**
 * Landing page for a doctor whose account is still awaiting administrator
 * verification. A pending doctor can sign in, but never reaches patient records.
 */
export default function PendingVerificationPage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [certStatus, setCertStatus] = useState(null);
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);

  // An already-verified doctor has no reason to sit on this page.
  useEffect(() => {
    if (isVerifiedDoctor(user)) navigate('/doctor/dashboard', { replace: true });
  }, [user, navigate]);

  const loadCertificate = useCallback(async () => {
    try {
      const data = await fetchCertificateStatus();
      setCertStatus(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadCertificate();
  }, [loadCertificate]);

  const handleUploadCert = async () => {
    if (!certFile || uploadingCert) return;
    setUploadingCert(true);
    try {
      const updated = await uploadCertificate(certFile);
      setCertStatus(updated);
      setCertFile(null);
      toast.success('Certificate encrypted with AES-256-GCM and uploaded successfully.');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to upload certificate.';
      toast.error(msg);
    } finally {
      setUploadingCert(false);
    }
  };

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      const current = await refresh();
      if (isVerifiedDoctor(current)) {
        toast.success('Your account has been verified. Welcome to the doctor portal.');
        navigate('/doctor/dashboard', { replace: true });
        return;
      }
      toast('Your application is still awaiting administrator review.', { icon: 'ℹ️' });
    } catch {
      toast.error('Could not check your verification status. Please try again.');
    } finally {
      setChecking(false);
    }
  }, [navigate, refresh]);

  const handleSignOut = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  return (
    <AuthLayout
      title="Verification pending"
      subtitle="An administrator is reviewing your medical registration details."
      footer={
        <button type="button" onClick={handleSignOut} className="link inline-flex items-center gap-1.5">
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      }
    >
      <div className="rounded-xl2 border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600">
            <Clock size={20} aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-amber-900">Pending Verification</h2>
              <StatusBadge status={user?.verificationStatus ?? 'pending'} />
            </div>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">
              You can sign in, but patient records stay locked until an administrator verifies your
              medical registration number. Your account status will change automatically once it is
              approved.
            </p>
          </div>
        </div>

        <dl className="mt-5 space-y-2 border-t border-amber-200 pt-4">
          <DetailRow label="Applicant" value={user?.fullName} />
          <DetailRow label="Email" value={user?.email} />
          <DetailRow label="Registration no." value={user?.medicalRegistrationNumber} />
          <DetailRow label="Specialization" value={user?.specialization} />
          <DetailRow label="Hospital / Clinic" value={user?.hospitalName} />
          <DetailRow label="Submitted" value={user?.createdAt ? formatDate(user.createdAt) : null} />
          <DetailRow label="Account status" value={user?.accountStatus} />
        </dl>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" icon={RefreshCw} loading={checking} onClick={handleCheck} fullWidth>
          Check verification status
        </Button>
        <Button variant="outline" icon={LogOut} onClick={handleSignOut} fullWidth>
          Sign out
        </Button>
      </div>

      {/* Medical Registration Certificate Card */}
      <div className="mt-5 rounded-xl2 border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <FileText size={20} aria-hidden="true" />
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-navy-900">Medical Registration Certificate</h3>
              {certStatus?.uploaded ? (
                <StatusBadge status="Uploaded" tone="success">
                  Encrypted & Uploaded
                </StatusBadge>
              ) : (
                <StatusBadge status="Required" tone="warning">
                  Pending Upload
                </StatusBadge>
              )}
            </div>

            {certStatus?.uploaded ? (
              <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                <div className="flex justify-between">
                  <span className="text-muted">File:</span>
                  <span className="font-medium text-navy-900">{certStatus.fileName || 'certificate.pdf'}</span>
                </div>
                {certStatus.uploadedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted">Uploaded on:</span>
                    <span>{formatDate(certStatus.uploadedAt)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1 text-teal-700">
                  <ShieldCheck size={14} />
                  <span>Encrypted with AES-256-GCM · SHA-256 integrity verified</span>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Please upload your registration certificate to assist the administrator in reviewing your application.
              </p>
            )}

            <div className="mt-4 space-y-3">
              <FileUpload
                id="pending-certificate-file"
                accept=".pdf,.jpg,.jpeg,.png"
                value={certFile}
                onChange={setCertFile}
                onRemove={() => setCertFile(null)}
                hint="PDF, JPG or PNG up to 10 MB"
              />
              {certFile && (
                <Button
                  variant="accent"
                  size="sm"
                  icon={Upload}
                  loading={uploadingCert}
                  onClick={handleUploadCert}
                  fullWidth
                >
                  {certStatus?.uploaded ? 'Replace Certificate' : 'Upload & Encrypt Certificate'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] text-muted ring-1 ring-inset ring-slate-200">
        <ShieldCheck size={13} className="shrink-0 text-teal-600" aria-hidden="true" />
        Being signed in does not grant access to any patient record — only an administrator can
        verify a doctor.
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] text-muted ring-1 ring-inset ring-slate-200">
        <BadgeCheck size={13} className="shrink-0 text-teal-600" aria-hidden="true" />
        Administrators review applications under “Verify Doctors” in the admin portal.
      </div>
    </AuthLayout>
  );
}
