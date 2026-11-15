import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import { Textarea } from '../../components/forms/FormControls';
import usePatientResource from '../../hooks/usePatientResource';
import {
  approveAccessRequest,
  fetchAccessRequests,
  fetchRecords,
  prepareConsentGrant,
  rejectAccessRequest,
  synchronizeConsentGrant,
} from '../../services/patientService';
import { apiErrorMessage } from '../../services/api';
import { useWallet } from '../../context/WalletContext';
import { cn, formatDate, formatDateTime, formatRelative, shortAddress } from '../../utils/format';

const PAGE_SIZE = 10;

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved (Decision)',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_TONES = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

const DURATION_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '365 days (1 year)', value: 365 },
];

export default function DoctorAccessRequests() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const [reviewTarget, setReviewTarget] = useState(null);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approving, setApproving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Phase 9: Grant on-chain blockchain consent state
  const [grantTarget, setGrantTarget] = useState(null);
  const [grantDuration, setGrantDuration] = useState(7);
  const [granting, setGranting] = useState(false);

  // Phase 6 category-first: patient chooses which records to share
  const [availableRecords, setAvailableRecords] = useState([]);
  const [recordsStatus, setRecordsStatus] = useState('idle');
  const [recordsError, setRecordsError] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [selectionError, setSelectionError] = useState('');

  const {
    address,
    connected,
    verified,
    connect,
    verifyWallet,
    getContractWithSigner,
  } = useWallet();

  const fetcher = useCallback(
    () =>
      fetchAccessRequests({
        page,
        limit: PAGE_SIZE,
        status: tab === 'all' ? undefined : tab,
      }),
    [page, tab]
  );

  const { status, data, error, reload, setData } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load your access requests.',
  });

  const requests = data?.requests ?? [];
  const pagination = data?.pagination;
  const pendingCount = data?.pendingCount ?? 0;

  const openReview = useCallback((request) => {
    setSelectionError('');
    setSelectedRecordIds([]);
    setReviewTarget(request);
  }, []);

  const openGrantModal = useCallback((request) => {
    setGrantTarget(request);
    setGrantDuration(request.requestedDuration || 7);
  }, []);

  useEffect(() => {
    let active = true;

    if (!reviewTarget || !reviewTarget.requiresRecordSelection) {
      setAvailableRecords([]);
      setRecordsStatus('idle');
      setRecordsError('');
      return () => {
        active = false;
      };
    }

    setRecordsStatus('loading');
    setRecordsError('');

    fetchRecords({ limit: 100 })
      .then((response) => {
        if (!active) return;
        const requestedCategories = reviewTarget.requestedCategories ?? [];
        const rows = response.records ?? [];
        const matching =
          requestedCategories.length === 0
            ? rows
            : rows.filter((record) => requestedCategories.includes(record.category));

        setAvailableRecords(matching);
        setSelectedRecordIds((prev) => (prev.length > 0 ? prev : matching.map((r) => r.id)));
        setRecordsStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        setRecordsStatus('error');
        setRecordsError(apiErrorMessage(err, 'Could not load your records for review.'));
      });

    return () => {
      active = false;
    };
  }, [reviewTarget]);

  const onTab = (key) => {
    setTab(key);
    setPage(1);
  };

  const tabCount = (key) => {
    if (key === 'pending') return pendingCount;
    if (key === tab) return pagination?.total ?? 0;
    return null;
  };

  const applyUpdatedRequest = (updated) => {
    setData((previous) =>
      previous
        ? {
            ...previous,
            requests: previous.requests.map((item) => (item.id === updated.id ? updated : item)),
            pendingCount: Math.max(0, (previous.pendingCount ?? 1) - 1),
          }
        : previous
    );
  };

  const toggleRecord = (recordId) => {
    setSelectionError('');
    setSelectedRecordIds((previous) =>
      previous.includes(recordId)
        ? previous.filter((id) => id !== recordId)
        : [...previous, recordId]
    );
  };

  const closeReview = () => setReviewTarget(null);

  const requestApprove = () => {
    if (!reviewTarget) return;
    if (reviewTarget.requiresRecordSelection && selectedRecordIds.length === 0) {
      setSelectionError('Select at least one of your records to share before approving.');
      return;
    }
    setSelectionError('');
    setApproveTarget(reviewTarget);
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const recordIds = approveTarget.requiresRecordSelection ? selectedRecordIds : undefined;
      const { request, message } = await approveAccessRequest(approveTarget.id, recordIds);
      applyUpdatedRequest(request);
      toast.success(message);
      setApproveTarget(null);
      closeReview();

      // Offer to immediately grant blockchain consent
      openGrantModal(request);
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not record your decision.'));
      reload({ silent: true });
    } finally {
      setApproving(false);
    }
  };

  const closeReject = () => {
    setRejectTarget(null);
    setRejectReason('');
    setRejectError('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setRejectError('Please give a reason of at least 3 characters.');
      return;
    }

    setRejecting(true);
    try {
      const { request, message } = await rejectAccessRequest(rejectTarget.id, reason);
      applyUpdatedRequest(request);
      toast.success(message);
      closeReject();
      closeReview();
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not record your decision.'));
      reload({ silent: true });
    } finally {
      setRejecting(false);
    }
  };

  // Phase 9: Handle Blockchain Consent Grant Transaction
  const handleGrantConsent = async () => {
    if (!grantTarget) return;

    setGranting(true);
    try {
      // 1. Ensure wallet is connected and verified
      if (!connected) {
        toast('Connecting MetaMask wallet...', { icon: '🦊' });
        const addr = await connect();
        if (!addr) return;
      }

      if (!verified) {
        toast('Please verify wallet ownership signature before executing transactions.', { icon: '✍️' });
        const ok = await verifyWallet();
        if (!ok) return;
      }

      const recordIds = (grantTarget.requestedRecords || []).map((r) => r.id || r._id);
      if (recordIds.length === 0) {
        toast.error('No medical records are selected on this approved request.');
        return;
      }

      // 2. Prepare transaction parameters with backend
      toast('Preparing consent transaction parameters...', { icon: '⚙️' });
      const prep = await prepareConsentGrant({
        requestId: grantTarget.id,
        selectedRecordIds: recordIds,
        durationDays: Number(grantDuration),
      });

      // 3. Prompt MetaMask transaction
      toast('Please confirm the grantConsent transaction in MetaMask...', { icon: '🦊' });
      const contract = await getContractWithSigner();
      const tx = await contract.grantConsent(
        prep.consentId,
        prep.doctorWallet,
        prep.recordHashes,
        prep.purposeHash,
        prep.expiry
      );

      toast('Transaction broadcast to blockchain. Waiting for block confirmation...', { icon: '⏳' });
      const receipt = await tx.wait();

      // 4. Synchronize with backend database
      await synchronizeConsentGrant({
        requestId: grantTarget.id,
        consentId: prep.consentId,
        transactionHash: receipt.hash,
        selectedRecordIds: recordIds,
        durationDays: Number(grantDuration),
      });

      toast.success('Blockchain consent successfully granted and anchored on-chain!');
      setGrantTarget(null);
      reload({ silent: true });
      navigate('/patient/consents');
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        toast.error('Transaction was rejected in MetaMask.');
      } else {
        const msg = err.response?.data?.message || err.message || 'Failed to grant blockchain consent.';
        toast.error(msg);
      }
    } finally {
      setGranting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'doctor',
        header: 'Doctor',
        render: (request) => (
          <div className="flex items-center gap-3">
            <Avatar name={request.doctor?.fullName ?? 'Doctor'} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-900">
                {request.doctor?.fullName ?? 'Unknown doctor'}
              </p>
              <p className="truncate text-xs text-muted">{request.doctor?.specialization ?? '—'}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'hospital',
        header: 'Hospital',
        render: (request) => <span className="text-sm">{request.doctor?.hospitalName ?? '—'}</span>,
      },
      {
        key: 'categories',
        header: 'Requested Records',
        render: (request) => (
          <div className="flex max-w-xs flex-wrap gap-1.5">
            {(request.requestedCategories ?? []).length > 0 ? (
              request.requestedCategories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {category}
                </span>
              ))
            ) : (request.requestedRecords ?? []).length > 0 ? (
              request.requestedRecords.map((record) => (
                <span
                  key={record.id}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {record.recordTitle}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">No records listed</span>
            )}
          </div>
        ),
      },
      {
        key: 'purpose',
        header: 'Purpose',
        render: (request) => (
          <p className="max-w-[16rem] text-sm text-muted" title={request.purpose}>
            {request.purpose}
          </p>
        ),
      },
      {
        key: 'requestedDuration',
        header: 'Duration',
        render: (request) => (
          <span className="text-sm text-slate-700">
            {request.requestedDuration ? `${request.requestedDuration} days` : '—'}
          </span>
        ),
      },
      {
        key: 'requestedAt',
        header: 'Request Date',
        render: (request) => (
          <div className="min-w-0">
            <p className="text-sm text-slate-700">{formatDate(request.requestedAt)}</p>
            <p className="text-xs text-muted">{formatRelative(request.requestedAt)}</p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (request) => (
          <StatusBadge status={request.status} tone={STATUS_TONES[request.status]}>
            {STATUS_LABELS[request.status] ?? request.status}
          </StatusBadge>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (request) => (
          <div className="flex items-center justify-end gap-2">
            {request.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={XCircle}
                  onClick={() => {
                    setRejectError('');
                    setRejectReason('');
                    setRejectTarget(request);
                  }}
                >
                  Reject
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  icon={CheckCircle2}
                  onClick={() => openReview(request)}
                >
                  Review
                </Button>
              </>
            )}

            {request.status === 'approved' && (
              <Button
                variant="primary"
                size="sm"
                icon={ShieldCheck}
                onClick={() => openGrantModal(request)}
              >
                Grant Blockchain Consent
              </Button>
            )}

            {request.status === 'rejected' && (
              <span className="text-xs text-muted">Rejected</span>
            )}
          </div>
        ),
      },
    ],
    [openReview, openGrantModal]
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title="Doctor Access Requests"
        subtitle="Doctors requesting access to your medical records. You decide what to share."
        actions={
          <Button variant="outline" icon={Clock} to="/patient/consents">
            View active consents
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-xl2 border border-sky-200 bg-sky-50 px-4 py-3.5">
        <Info size={18} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
        <p className="text-sm text-sky-800">
          <strong>Two-step authorization:</strong> Approving a request records your consent decision.
          To authorize doctor access, execute the <strong>Grant Blockchain Consent</strong> action which writes
          an on-chain permission transaction into the smart contract.
        </p>
      </div>

      <Card bodyClassName="p-2 sm:p-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((item) => {
            const count = tabCount(item.key);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTab(item.key)}
                className={cn(
                  'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                  tab === item.key ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {item.label}
                {count !== null && (
                  <span
                    className={cn(
                      'ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]',
                      tab === item.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title="Requests"
        subtitle={pagination ? `${pagination.total} request(s)` : 'Your access requests'}
        bodyClassName="p-0"
      >
        {status === 'error' ? (
          <ErrorState
            title="We could not load your access requests"
            message={error}
            onRetry={() => reload()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={requests}
              keyField="id"
              loading={status === 'loading'}
              skeletonRows={5}
              empty={
                <EmptyState
                  icon={ShieldCheck}
                  title="No access requests found"
                  description="When a doctor requests access to your records it will appear here for review."
                />
              }
            />
            {status === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="request" />
            )}
          </>
        )}
      </Card>

      {/* Review Request Modal (Approve / Reject decision) */}
      <Modal
        open={Boolean(reviewTarget)}
        onClose={closeReview}
        title="Review Access Request"
        description="Inspect who is asking and why, then record your decision."
        icon={ShieldCheck}
        iconTone="teal"
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={closeReview}>
              Cancel
            </Button>
            <Button
              variant="outline"
              icon={XCircle}
              onClick={() => {
                setRejectError('');
                setRejectReason('');
                setRejectTarget(reviewTarget);
              }}
            >
              Reject
            </Button>
            <Button variant="success" icon={CheckCircle2} onClick={requestApprove}>
              Approve Request
            </Button>
          </>
        }
      >
        {reviewTarget && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl2 bg-slate-50 p-4">
              <Avatar name={reviewTarget.doctor?.fullName ?? 'Doctor'} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-navy-900">{reviewTarget.doctor?.fullName}</p>
                <p className="text-xs text-muted">
                  {reviewTarget.doctor?.specialization ?? 'General practitioner'} ·{' '}
                  {reviewTarget.doctor?.hospitalName ?? 'Independent clinic'}
                </p>
                {reviewTarget.doctor?.walletAddress && (
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    Wallet: {shortAddress(reviewTarget.doctor.walletAddress, 8, 4)}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl2 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Purpose</p>
              <p className="mt-1 text-sm text-slate-700">{reviewTarget.purpose}</p>
            </div>

            {reviewTarget.requiresRecordSelection && (
              <div>
                <p className="mb-1 text-sm font-semibold text-navy-900">
                  Choose the records you want to share
                </p>
                <p className="mb-3 text-xs text-muted">
                  Only records that belong to you can be selected.
                </p>

                {recordsStatus === 'ready' && (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {availableRecords.map((record) => {
                      const checked = selectedRecordIds.includes(record.id);
                      return (
                        <label
                          key={record.id}
                          className={cn(
                            'flex cursor-pointer items-center justify-between gap-3 rounded-xl2 border p-3 transition-colors',
                            checked
                              ? 'border-teal-500 bg-teal-50/40'
                              : 'border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRecord(record.id)}
                              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <div>
                              <p className="text-sm font-medium text-navy-900">{record.recordTitle}</p>
                              <p className="text-xs text-muted">{record.category}</p>
                            </div>
                          </div>
                          <span className="text-xs text-muted">{formatDate(record.reportDate)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {selectionError && <p className="mt-2 text-xs text-red-600">{selectionError}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Grant Blockchain Consent Modal (Phase 9) */}
      <Modal
        open={Boolean(grantTarget)}
        onClose={() => setGrantTarget(null)}
        title="Grant Blockchain Consent"
        description="Write an immutable permission anchor into the local MediConsent smart contract."
        icon={Wallet}
        iconTone="teal"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setGrantTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={ShieldCheck}
              loading={granting}
              disabled={!verified || !grantTarget?.doctor?.walletAddress}
              onClick={handleGrantConsent}
            >
              Sign & Grant on Blockchain
            </Button>
          </>
        }
      >
        {grantTarget && (
          <div className="space-y-4">
            <div className="rounded-xl2 border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy-900">{grantTarget.doctor?.fullName}</p>
                  <p className="text-xs text-muted">{grantTarget.doctor?.hospitalName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-medium uppercase text-muted">Doctor Wallet</p>
                  <p className="font-mono text-xs text-navy-900">
                    {grantTarget.doctor?.walletAddress
                      ? shortAddress(grantTarget.doctor.walletAddress, 8, 4)
                      : 'Not linked yet'}
                  </p>
                </div>
              </div>
            </div>

            {!grantTarget.doctor?.walletAddress && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <p>
                  This doctor has not linked an Ethereum wallet yet. On-chain consent requires both patient
                  and doctor wallet addresses.
                </p>
              </div>
            )}

            {/* Wallet verification prompt for patient */}
            {(!connected || !verified) && (
              <div className="rounded-xl2 border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-900">Wallet Verification Required</p>
                <p className="mt-1 text-xs text-amber-800">
                  You must connect and verify your MetaMask wallet before submitting the transaction.
                </p>
                <div className="mt-3 flex gap-2">
                  {!connected ? (
                    <Button variant="primary" size="sm" onClick={connect}>
                      Connect MetaMask
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={verifyWallet}>
                      Verify Wallet Signature
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="consent-duration" className="block text-xs font-semibold uppercase tracking-wide text-muted">
                Consent Duration
              </label>
              <select
                id="consent-duration"
                value={grantDuration}
                onChange={(e) => setGrantDuration(Number(e.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Authorized Records ({(grantTarget.requestedRecords || []).length})
              </p>
              <div className="mt-1.5 max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
                {(grantTarget.requestedRecords || []).map((r) => (
                  <div key={r.id || r._id} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-navy-900">{r.recordTitle}</span>
                    <span className="text-muted">{r.category}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-teal-50 p-3 text-xs text-teal-800">
              <p className="font-semibold">Security Note</p>
              <p className="mt-0.5">
                Only cryptographic record hashes and your doctor's wallet address are sent to the blockchain.
                Your medical files and personal details remain encrypted off-chain.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Approve confirmation */}
      <ConfirmDialog
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        tone="success"
        title="Approve this access request?"
        message="Your approval decision will be recorded. You can then execute the on-chain blockchain transaction."
        confirmLabel="Approve"
        loading={approving}
      />

      {/* Reject confirmation */}
      <ConfirmDialog
        open={Boolean(rejectTarget)}
        onClose={closeReject}
        onConfirm={handleReject}
        tone="danger"
        title="Reject this request?"
        message="The doctor is informed that you declined, together with your reason."
        confirmLabel="Reject request"
        loading={rejecting}
      >
        <div>
          <label htmlFor="reject-reason" className="label">
            Reason <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={rejectReason}
            onChange={(event) => {
              setRejectReason(event.target.value);
              setRejectError('');
            }}
            placeholder="Let the doctor know why you declined (3–500 characters)"
            error={rejectError}
          />
          {rejectError && (
            <p className="error-text" role="alert">
              {rejectError}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
