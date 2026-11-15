import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Hash,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';
import FilterDropdown from '../../components/common/FilterDropdown';
import Modal from '../../components/common/Modal';
import PageHeading from '../../components/common/PageHeading';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import Field from '../../components/forms/Field';
import { Select, Textarea } from '../../components/forms/FormControls';
import * as adminService from '../../services/adminService';
import { apiErrorMessage } from '../../services/api';
import { formatDate, formatDateTime, formatFileSize, formatNumber } from '../../utils/format';

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Rejected', value: 'Rejected' },
];

/** Backend `verificationStatus` -> the label the table uses. */
const STATUS_LABEL = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
};

const REJECTION_REASONS = [
  {
    label: 'Certificate illegible or unreadable',
    value: 'Uploaded certificate was illegible. Please re-submit a clear scanned copy.',
  },
  {
    label: 'Registration number could not be verified',
    value: 'Registration number could not be verified with the medical council.',
  },
  {
    label: 'Name mismatch on certificate',
    value: 'The name on the certificate does not match the registered doctor profile.',
  },
  {
    label: 'Certificate appears expired',
    value: 'The uploaded registration certificate appears to be expired.',
  },
  {
    label: 'Supporting documents incomplete',
    value: 'Supporting documents are incomplete or missing.',
  },
];

/** Map a backend doctor record onto the shape this screen renders. */
function toDoctorRow(user) {
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    mobile: user.mobileNumber,
    registrationNumber: user.medicalRegistrationNumber,
    specialization: user.specialization,
    hospital: user.hospitalName,
    status: STATUS_LABEL[user.verificationStatus] ?? 'Pending',
    registeredAt: user.createdAt,
    verifiedAt: user.verifiedAt,
    rejectionReason: user.verificationReason,
    certificate: {
      available: Boolean(user.certificate?.uploaded),
      name: user.certificate?.fileName || (user.certificate?.uploaded ? 'certificate.pdf' : 'Not uploaded yet'),
      uploadedAt: user.certificate?.uploadedAt,
      fileSize: user.certificate?.fileSize,
      mimeType: user.certificate?.mimeType,
    },
  };
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="break-words text-sm font-medium text-navy-900">{value}</p>
      </div>
    </div>
  );
}

export default function VerifyDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, verified: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState('Pending');
  const [detailId, setDetailId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [downloadingCert, setDownloadingCert] = useState(false);
  const [approveId, setApproveId] = useState(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectPreset, setRejectPreset] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [pendingReject, setPendingReject] = useState(null);
  const [rejectBusy, setRejectBusy] = useState(false);

  const detail = doctors.find((doctor) => doctor.id === detailId) ?? null;
  const approveDoc = doctors.find((doctor) => doctor.id === approveId) ?? null;

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const { doctors: list, counts: nextCounts } = await adminService.fetchPendingDoctors();
      setDoctors(list.map(toDoctorRow));
      setCounts(nextCounts);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load doctor applications.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      statusFilter === 'all'
        ? doctors
        : doctors.filter((doctor) => doctor.status === statusFilter),
    [doctors, statusFilter]
  );

  const confirmApprove = async () => {
    setApproveBusy(true);
    try {
      await adminService.approveDoctor(approveId);
      toast.success('Doctor approved and account activated.');
      setApproveId(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Unable to approve this doctor.'));
    } finally {
      setApproveBusy(false);
    }
  };

  const handleDownloadCertificate = async (doc) => {
    if (!doc?.certificate?.available || downloadingCert) return;
    setDownloadingCert(true);
    try {
      await adminService.downloadDoctorCertificate(doc.id, doc.certificate.name || `certificate-${doc.name}.pdf`);
      toast.success(`Downloaded certificate for ${doc.name}`);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Could not download certificate.';
      toast.error(msg);
    } finally {
      setDownloadingCert(false);
    }
  };

  const openReject = (doctor) => {
    setRejectTarget(doctor);
    setRejectPreset('');
    setRejectReason('');
    setRejectError('');
  };

  const continueReject = () => {
    if (!rejectReason.trim()) {
      setRejectError('A rejection reason is required.');
      return;
    }
    setPendingReject({ id: rejectTarget.id, name: rejectTarget.name, reason: rejectReason.trim() });
    setRejectTarget(null);
  };

  const confirmReject = async () => {
    setRejectBusy(true);
    try {
      await adminService.rejectDoctor(pendingReject.id, pendingReject.reason);
      toast.success('Doctor application rejected.');
      setPendingReject(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Unable to reject this application.'));
    } finally {
      setRejectBusy(false);
    }
  };

  return (
    <>
      <PageHeading
        title="Verify Doctors"
        subtitle="Review medical registration details and decide whether a clinician may join the platform."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Verify Doctors' }]}
        actions={
          <Button variant="outline" icon={RefreshCw} onClick={() => load()} loading={loading}>
            Refresh list
          </Button>
        }
      />

      {/* Summary strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={formatNumber(counts.pending)} icon={BadgeCheck} tone="amber" />
        <StatCard label="Verified" value={formatNumber(counts.verified)} icon={ShieldCheck} tone="emerald" />
        <StatCard label="Rejected" value={formatNumber(counts.rejected)} icon={XCircle} tone="red" />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Showing <span className="font-medium text-navy-900">{filtered.length}</span> of{' '}
          {doctors.length} pending submissions.
        </p>
        <FilterDropdown
          id="verification-status"
          label="Verification status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
          className="sm:w-52"
        />
      </div>

      <div className="mt-4 space-y-4">
        {error ? (
          <Card>
            <EmptyState
              icon={XCircle}
              title="Could not load applications"
              description={error}
              action={
                <Button variant="outline" icon={RefreshCw} onClick={() => load()}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : loading ? (
          <Card>
            <div className="flex items-center justify-center gap-3 px-6 py-14 text-sm text-muted">
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600"
                aria-hidden="true"
              />
              Loading doctor applications…
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={BadgeCheck}
              title="Nothing to review"
              description={
                statusFilter === 'Pending'
                  ? 'There are no doctor applications awaiting verification.'
                  : 'Only pending applications are listed here. Verified and rejected doctors are counted in the summary above.'
              }
              action={
                statusFilter === 'Pending' ? (
                  <Button variant="outline" onClick={() => setStatusFilter('all')}>
                    Show all statuses
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          filtered.map((doctor) => {
            const isVerified = doctor.status === 'Verified';
            const isRejected = doctor.status === 'Rejected';

            return (
              <Card key={doctor.id} hover>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <Avatar name={doctor.name} size="lg" />
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-navy-900">{doctor.name}</h3>
                        <StatusBadge status={doctor.status} />
                      </div>
                      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                        <Stethoscope size={14} aria-hidden="true" />
                        {doctor.specialization}
                        <span className="text-slate-300">·</span>
                        <Building2 size={14} aria-hidden="true" />
                        {doctor.hospital}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Mail size={13} aria-hidden="true" /> {doctor.email}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Phone size={13} aria-hidden="true" /> {doctor.mobile}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Hash size={13} aria-hidden="true" />
                          <span className="font-mono">{doctor.registrationNumber}</span>
                        </span>
                      </div>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <CalendarDays size={13} aria-hidden="true" />
                        Submitted {formatDate(doctor.registeredAt)}
                        {doctor.verifiedAt && (
                          <>
                            <span className="text-slate-300">·</span>
                            Verified {formatDateTime(doctor.verifiedAt)}
                          </>
                        )}
                      </p>
                      {isRejected && doctor.rejectionReason && (
                        <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                          <XCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {doctor.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">
                    <div className="rounded-xl2 border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 ring-1 ring-slate-200">
                          <FileText size={16} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-medium text-slate-700">
                            {doctor.certificate.name}
                          </p>
                          <p className="text-xs text-muted">
                            {doctor.certificate.available
                              ? 'AES-256-GCM encrypted'
                              : 'No certificate uploaded yet'}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        fullWidth
                        className="mt-3"
                        icon={Eye}
                        onClick={() => setPreviewDoc(doctor)}
                      >
                        Preview certificate
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" icon={Eye} onClick={() => setDetailId(doctor.id)}>
                        View details
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        icon={CheckCircle2}
                        disabled={isVerified || isRejected}
                        onClick={() => setApproveId(doctor.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={XCircle}
                        disabled={isVerified || isRejected}
                        onClick={() => openReject(doctor)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Certificate modal */}
      <Modal
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title="Medical Registration Certificate"
        description={previewDoc ? `Applicant: ${previewDoc.name}` : ''}
        icon={FileText}
        iconTone="teal"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>
              Close
            </Button>
            {previewDoc?.certificate?.available && (
              <Button
                variant="primary"
                icon={Download}
                loading={downloadingCert}
                onClick={() => handleDownloadCertificate(previewDoc)}
              >
                Download Decrypted Certificate
              </Button>
            )}
          </>
        }
      >
        {previewDoc && (
          <div className="space-y-4">
            {previewDoc.certificate.available ? (
              <div className="rounded-xl2 border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <FileText size={24} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-semibold text-navy-900">
                      {previewDoc.certificate.name}
                    </p>
                    <p className="text-xs text-muted">
                      {previewDoc.certificate.mimeType || 'Document'} · {formatFileSize(previewDoc.certificate.fileSize)}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Doctor Name</dt>
                    <dd className="mt-0.5 font-medium text-navy-900">{previewDoc.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Registration Number</dt>
                    <dd className="mt-0.5 font-medium text-navy-900">{previewDoc.registrationNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Specialization</dt>
                    <dd className="mt-0.5 font-medium text-navy-900">{previewDoc.specialization}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Uploaded Date</dt>
                    <dd className="mt-0.5 font-medium text-navy-900">
                      {previewDoc.certificate.uploadedAt ? formatDate(previewDoc.certificate.uploadedAt) : '—'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">
                  <ShieldCheck size={16} className="shrink-0 text-teal-600" />
                  <span>AES-256-GCM encrypted in private storage. SHA-256 integrity verified upon download.</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl2 border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
                <div>
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200">
                    <FileText size={22} aria-hidden="true" />
                  </span>
                  <p className="mt-4 font-mono text-sm font-medium text-slate-700">
                    No certificate uploaded
                  </p>
                  <p className="mx-auto mt-2 max-w-sm text-xs text-muted">
                    This doctor applicant has not uploaded a medical registration certificate yet.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Full detail modal */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        title="Verification details"
        description={detail ? detail.name : ''}
        icon={BadgeCheck}
        iconTone="navy"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setDetailId(null)}>
            Close
          </Button>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={detail.name} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-navy-900">{detail.name}</h3>
                  <StatusBadge status={detail.status} />
                </div>
                <p className="font-mono text-xs text-muted">{detail.id}</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              <DetailRow icon={Mail} label="Email" value={detail.email} />
              <DetailRow icon={Phone} label="Mobile" value={detail.mobile} />
              <DetailRow icon={Hash} label="Medical registration number" value={detail.registrationNumber} />
              <DetailRow icon={Stethoscope} label="Specialization" value={detail.specialization} />
              <DetailRow icon={Building2} label="Hospital" value={detail.hospital} />
              <DetailRow icon={CalendarDays} label="Registration date" value={formatDate(detail.registeredAt)} />
              <DetailRow
                icon={ShieldCheck}
                label="Verified on"
                value={detail.verifiedAt ? formatDateTime(detail.verifiedAt) : 'Not yet verified'}
              />
              <DetailRow
                icon={FileText}
                label="Certificate"
                value={
                  detail.certificate?.available
                    ? `${detail.certificate.name} (AES-256-GCM Encrypted)`
                    : 'Not uploaded yet'
                }
              />
            </div>

            {detail.rejectionReason && (
              <div className="flex items-start gap-2.5 rounded-xl2 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Rejection reason</p>
                  <p className="mt-0.5">{detail.rejectionReason}</p>
                </div>
              </div>
            )}

            {detail.status === 'Verified' && (
              <p className="text-xs text-muted">
                This doctor is verified. Approve and reject actions are disabled for verified
                records.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Approve confirmation */}
      <ConfirmDialog
        open={Boolean(approveDoc)}
        onClose={() => setApproveId(null)}
        onConfirm={confirmApprove}
        tone="success"
        loading={approveBusy}
        title="Approve this doctor?"
        message={
          approveDoc
            ? `${approveDoc.name} (${approveDoc.registrationNumber}) will be marked as verified and their account activated.`
            : ''
        }
        confirmLabel="Approve doctor"
      >
        <p className="text-sm text-muted">
          The doctor&apos;s verification status becomes <strong className="font-medium">verified</strong>{' '}
          and their account becomes <strong className="font-medium">active</strong>. This action is
          recorded in the activity log.
        </p>
      </ConfirmDialog>

      {/* Rejection reason modal */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject verification"
        description={rejectTarget ? `Provide a reason for rejecting ${rejectTarget.name}.` : ''}
        icon={XCircle}
        iconTone="red"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={continueReject}>
              Continue
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Common rejection reasons" htmlFor="reject-preset" optional>
            <Select
              id="reject-preset"
              options={REJECTION_REASONS}
              placeholder="Select a common reason"
              value={rejectPreset}
              onChange={(event) => {
                setRejectPreset(event.target.value);
                setRejectReason(event.target.value);
                setRejectError('');
              }}
            />
          </Field>

          <Field
            label="Rejection reason"
            htmlFor="reject-reason"
            required
            error={rejectError}
            hint="This reason is recorded with the application and stored in the activity log."
          >
            <Textarea
              id="reject-reason"
              rows={4}
              value={rejectReason}
              error={Boolean(rejectError)}
              onChange={(event) => {
                setRejectReason(event.target.value);
                setRejectError('');
              }}
              placeholder="Explain why this registration cannot be approved…"
            />
          </Field>
        </div>
      </Modal>

      {/* Rejection confirmation */}
      <ConfirmDialog
        open={Boolean(pendingReject)}
        onClose={() => setPendingReject(null)}
        onConfirm={confirmReject}
        tone="danger"
        loading={rejectBusy}
        title="Confirm rejection"
        message={pendingReject ? `Reject the registration of ${pendingReject.name}?` : ''}
        confirmLabel="Reject doctor"
      >
        {pendingReject && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Reason: </span>
            {pendingReject.reason}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
