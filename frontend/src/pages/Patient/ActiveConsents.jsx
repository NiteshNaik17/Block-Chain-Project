import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, Copy, Check, FileText, Info, Link2Off, ShieldCheck, ShieldOff } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import FilterDropdown from '../../components/common/FilterDropdown';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import usePatientResource from '../../hooks/usePatientResource';
import {
  fetchConsents,
  prepareConsentRevocation,
  synchronizeConsentRevocation,
} from '../../services/patientService';
import { useWallet } from '../../context/WalletContext';
import { daysUntil, formatDate, formatRelative, shortAddress } from '../../utils/format';

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Revoked', value: 'revoked' },
];

const STATUS_LABELS = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

const STATUS_TONES = {
  active: 'success',
  expired: 'danger',
  revoked: 'danger',
};

export default function ActiveConsents() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [copiedHash, setCopiedHash] = useState(null);

  const { connect, verifyWallet, verified, getContractWithSigner } = useWallet();

  const fetcher = useCallback(
    () =>
      fetchConsents({
        page,
        limit: PAGE_SIZE,
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load your consents.',
  });

  const consents = data?.consents ?? [];
  const counts = data?.counts ?? { total: 0, active: 0, expiringSoon: 0, blockchainBacked: 0 };
  const pagination = data?.pagination;

  const copyToClipboard = (hash) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success('Transaction hash copied to clipboard');
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;

    setRevoking(true);
    try {
      if (!verified) {
        toast('Please connect and verify your MetaMask wallet first.', { icon: '🦊' });
        const ok = await verifyWallet();
        if (!ok) return;
      }

      // 1. Prepare revocation with backend
      const prep = await prepareConsentRevocation(revokeTarget.id);

      // 2. Execute on-chain revocation transaction
      toast('Please confirm the revocation transaction in MetaMask...', { icon: '🦊' });
      const contract = await getContractWithSigner();
      const tx = await contract.revokeConsent(prep.consentId);

      toast('Revocation transaction submitted. Waiting for confirmation...', { icon: '⏳' });
      const receipt = await tx.wait();

      // 3. Synchronize with backend
      await synchronizeConsentRevocation(revokeTarget.id, { transactionHash: receipt.hash });

      toast.success('Consent successfully revoked on the blockchain.');
      setRevokeTarget(null);
      reload({ silent: true });
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        toast.error('Transaction was rejected in MetaMask.');
      } else {
        const msg = err.response?.data?.message || err.message || 'Failed to revoke consent on-chain.';
        toast.error(msg);
      }
    } finally {
      setRevoking(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'doctor',
        header: 'Doctor',
        render: (consent) => (
          <div className="flex items-center gap-3">
            <Avatar name={consent.doctor?.fullName ?? 'Doctor'} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-900">
                {consent.doctor?.fullName ?? 'Unknown doctor'}
              </p>
              <p className="truncate text-xs text-muted">{consent.doctor?.specialization ?? '—'}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'hospital',
        header: 'Hospital',
        render: (consent) => <span className="text-sm">{consent.doctor?.hospitalName ?? '—'}</span>,
      },
      {
        key: 'records',
        header: 'Authorized Records',
        render: (consent) => (
          <div className="flex max-w-xs flex-wrap gap-1.5">
            {consent.authorizedRecords.length === 0 ? (
              <span className="text-xs text-muted">No records linked</span>
            ) : (
              consent.authorizedRecords.map((record) => (
                <span
                  key={record.id}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {record.recordTitle}
                </span>
              ))
            )}
          </div>
        ),
      },
      {
        key: 'purpose',
        header: 'Purpose',
        render: (consent) => (
          <p className="max-w-[16rem] text-sm text-muted" title={consent.purpose}>
            {consent.purpose ?? '—'}
          </p>
        ),
      },
      {
        key: 'grantedAt',
        header: 'Approval Date',
        render: (consent) => formatDate(consent.grantedAt),
      },
      {
        key: 'expiresAt',
        header: 'Expiry Date',
        render: (consent) => {
          const daysLeft = daysUntil(consent.expiresAt);
          const expired = consent.status === 'expired';
          return (
            <div className="min-w-0">
              <p className="text-sm text-slate-700">{formatDate(consent.expiresAt)}</p>
              <p className="text-xs text-muted">{formatRelative(consent.expiresAt)}</p>
              {!expired && daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && (
                <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {daysLeft} days left
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'status',
        header: 'Status',
        render: (consent) => (
          <StatusBadge status={consent.status} tone={STATUS_TONES[consent.status]}>
            {STATUS_LABELS[consent.status] ?? consent.status}
          </StatusBadge>
        ),
      },
      {
        key: 'transactionReference',
        header: 'Transaction Hash',
        render: (consent) =>
          consent.transactionReference ? (
            <div className="flex items-center gap-1.5 font-mono text-xs text-navy-900">
              <span title={consent.transactionReference}>
                {shortAddress(consent.transactionReference, 8, 4)}
              </span>
              <button
                type="button"
                className="text-slate-400 hover:text-navy-900"
                title="Copy full transaction hash"
                onClick={() => copyToClipboard(consent.transactionReference)}
              >
                {copiedHash === consent.transactionReference ? (
                  <Check size={13} className="text-emerald-600" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-xs italic text-muted"
              title="Legacy off-chain consent"
            >
              <Link2Off size={13} aria-hidden="true" />
              Off-chain
            </span>
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (consent) =>
          consent.status === 'active' && consent.blockchainConsentId ? (
            <Button
              variant="outline"
              size="sm"
              icon={ShieldOff}
              onClick={() => setRevokeTarget(consent)}
            >
              Revoke Access
            </Button>
          ) : (
            <span className="text-xs text-muted">
              {consent.status === 'revoked' ? 'Revoked' : 'Expired'}
            </span>
          ),
      },
    ],
    [copiedHash]
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title="Active Consents"
        subtitle="Consents recorded and verified on the local blockchain."
        actions={
          <Button variant="outline" icon={Clock} to="/patient/consent-history">
            View consent history
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-xl2 border border-sky-200 bg-sky-50 px-4 py-3.5">
        <Info size={18} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
        <p className="text-sm text-sky-800">
          Consents granted here are written to the local Hardhat smart contract. Doctors can only
          download records while on-chain consent is active and unrevoked.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Consents" value={counts.total} icon={FileText} tone="neutral" />
        <StatCard title="Active Consents" value={counts.active} icon={ShieldCheck} tone="success" />
        <StatCard
          title="Expiring Soon"
          value={counts.expiringSoon}
          icon={Clock}
          tone={counts.expiringSoon > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          title="Blockchain Anchored"
          value={counts.blockchainBacked}
          icon={ShieldCheck}
          tone="teal"
        />
      </div>

      <Card
        title="Consents"
        subtitle={
          pagination
            ? `${pagination.total} consent(s) recorded`
            : 'Consents granted from your account'
        }
        actions={
          <FilterDropdown
            label="Status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          />
        }
        bodyClassName="p-0"
      >
        {status === 'error' ? (
          <ErrorState
            title="We could not load your consents"
            message={error}
            onRetry={() => reload()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={consents}
              keyField="id"
              loading={status === 'loading'}
              skeletonRows={5}
              empty={
                <EmptyState
                  icon={ShieldCheck}
                  title="No consents found"
                  description="When you grant blockchain consent for an approved doctor request, it will appear here."
                />
              }
            />
            {status === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="consent" />
            )}
          </>
        )}
      </Card>

      {/* Revocation Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        tone="danger"
        title="Revoke Blockchain Consent?"
        message={`Are you sure you want to revoke consent for ${revokeTarget?.doctor?.fullName || 'the doctor'}? This will immediately write a revocation transaction to the blockchain, blocking any future downloads.`}
        confirmLabel="Revoke on Blockchain"
        loading={revoking}
      >
        <p className="text-xs text-muted">
          Note: On-chain revocation permanently invalidates the doctor's access permission for these records.
          However, revocation cannot delete files that a doctor may have previously downloaded.
        </p>
      </ConfirmDialog>
    </div>
  );
}
