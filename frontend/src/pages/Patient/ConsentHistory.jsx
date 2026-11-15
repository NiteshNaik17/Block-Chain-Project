import { useCallback, useMemo, useState } from 'react';
import { Clock, FileText, Info } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import FilterDropdown from '../../components/common/FilterDropdown';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import usePatientResource from '../../hooks/usePatientResource';
import { fetchConsentHistory } from '../../services/patientService';
import { formatDate, formatRelative, shortAddress } from '../../utils/format';

const PAGE_SIZE = 10;

const DECISION_OPTIONS = [
  { label: 'Granted', value: 'granted' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Revoked', value: 'revoked' },
  { label: 'Expired', value: 'expired' },
];

/**
 * A consent event and an access-request decision are different things, so they
 * are labelled differently: only a real Consent record can ever carry a
 * blockchain transaction reference.
 */
const DECISION_LABELS = {
  granted: 'Granted',
  approved: 'Approved (decision)',
  rejected: 'Rejected',
  revoked: 'Revoked',
  expired: 'Expired',
};

const DECISION_TONES = {
  granted: 'success',
  approved: 'success',
  rejected: 'danger',
  revoked: 'neutral',
  expired: 'warning',
};

const SOURCE_LABELS = {
  consent: 'Consent record',
  access_request: 'Access request decision',
};

export default function ConsentHistory() {
  const [decision, setDecision] = useState('all');
  const [page, setPage] = useState(1);

  const fetcher = useCallback(
    () =>
      fetchConsentHistory({
        page,
        limit: PAGE_SIZE,
        decision: decision === 'all' ? undefined : decision,
      }),
    [page, decision]
  );

  const { status: loadStatus, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load your consent history.',
  });

  const entries = data?.entries ?? [];
  const pagination = data?.pagination;

  const onDecision = (value) => {
    setDecision(value);
    setPage(1);
  };

  const columns = useMemo(
    () => [
      {
        key: 'doctor',
        header: 'Doctor',
        render: (entry) => (
          <div className="flex items-center gap-3">
            <Avatar name={entry.doctor?.fullName} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-900">
                {entry.doctor?.fullName ?? 'Unknown doctor'}
              </p>
              <p className="truncate text-xs text-muted">{entry.doctor?.hospitalName ?? '—'}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'records',
        header: 'Records',
        render: (entry) => (
          <div className="flex max-w-xs flex-wrap gap-1.5">
            {entry.records.length > 0 ? (
              entry.records.map((record) => (
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
        key: 'decision',
        header: 'Decision',
        render: (entry) => (
          <div className="min-w-0">
            <StatusBadge status={entry.decision} tone={DECISION_TONES[entry.decision]}>
              {DECISION_LABELS[entry.decision] ?? entry.decision}
            </StatusBadge>
            <p className="mt-1 text-xs text-muted">
              {SOURCE_LABELS[entry.source] ?? entry.source}
            </p>
          </div>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        render: (entry) => (
          <div className="min-w-0">
            <p className="text-sm text-slate-700">{formatDate(entry.date)}</p>
            <p className="text-xs text-muted">{formatRelative(entry.date)}</p>
          </div>
        ),
      },
      {
        key: 'expiresAt',
        header: 'Expires',
        render: (entry) => (
          <span className="text-sm text-slate-700">
            {entry.expiresAt ? formatDate(entry.expiresAt) : '—'}
          </span>
        ),
      },
      {
        key: 'transactionReference',
        header: 'Transaction Reference',
        render: (entry) =>
          entry.transactionReference ? (
            <span
              className="font-mono text-xs text-navy-900"
              title={entry.transactionReference}
            >
              {shortAddress(entry.transactionReference)}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-xs italic text-muted"
              title="No on-chain anchor exists for this decision. Blockchain consent is Phase 9."
            >
              <Info size={13} aria-hidden="true" />
              Not recorded yet
            </span>
          ),
      },
    ],
    []
  );

  const hasFilter = decision !== 'all';

  return (
    <div className="space-y-6">
      <PageHeading
        title="Consent History"
        subtitle="A complete record of every access decision you have made."
      />

      <Card bodyClassName="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-muted">
            {pagination ? `${pagination.total} entr${pagination.total === 1 ? 'y' : 'ies'}` : 'History'}
          </p>
          <FilterDropdown
            id="consent-history-decision"
            label="Decision"
            value={decision}
            onChange={onDecision}
            allLabel="All decisions"
            options={DECISION_OPTIONS}
            className="lg:w-56"
          />
        </div>
      </Card>

      <Card title="History" bodyClassName="p-0">
        {loadStatus === 'error' ? (
          <ErrorState
            title="We could not load your consent history"
            message={error}
            onRetry={() => reload()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={entries}
              keyField="id"
              loading={loadStatus === 'loading'}
              skeletonRows={6}
              footer="An approved access request is your recorded decision — it is not a blockchain-backed consent. On-chain references are recorded in Phase 9."
              empty={
                <EmptyState
                  icon={Clock}
                  title="No consent history found"
                  description={
                    hasFilter
                      ? 'No entries match this decision filter. Try a different one.'
                      : 'Nothing has been decided yet. Requests you approve or reject will appear here.'
                  }
                />
              }
            />
            {loadStatus === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="entry" />
            )}
          </>
        )}
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted">
        <FileText size={14} aria-hidden="true" />
        Consent decisions here are historical records of your activity.
        <Button variant="ghost" size="sm" to="/patient/consents" className="ml-auto">
          View active consents
        </Button>
      </div>
    </div>
  );
}
