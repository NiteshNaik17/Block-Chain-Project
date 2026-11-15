import { useCallback, useState } from 'react';
import { Activity, CheckCircle2, FileText, ShieldCheck, XCircle } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import FilterDropdown from '../../components/common/FilterDropdown';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import usePatientResource from '../../hooks/usePatientResource';
import { fetchAccessHistory } from '../../services/doctorService';
import { cn, formatDate, formatTime } from '../../utils/format';

const PAGE_SIZE = 10;

const RESULT_OPTIONS = [
  { label: 'Granted', value: 'granted' },
  { label: 'Denied', value: 'denied' },
];

/** Immutable audit trail of every record access attempt made by the doctor. */
export default function AccessHistory() {
  const [result, setResult] = useState('all');
  const [page, setPage] = useState(1);

  const onResult = (value) => {
    setResult(value);
    setPage(1);
  };

  const fetcher = useCallback(
    () =>
      fetchAccessHistory({
        page,
        limit: PAGE_SIZE,
        result: result === 'all' ? undefined : result,
      }),
    [page, result]
  );

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load your access history.',
  });

  const entries = data?.entries ?? [];
  const counts = data?.counts;
  const pagination = data?.pagination;

  const summary = [
    { key: 'total', label: 'Total accesses', value: counts?.total ?? 0, icon: Activity, tone: 'text-navy-700 bg-navy-50' },
    { key: 'granted', label: 'Granted', value: counts?.granted ?? 0, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
    { key: 'denied', label: 'Denied', value: counts?.denied ?? 0, icon: XCircle, tone: 'text-red-700 bg-red-50' },
  ];

  const columns = [
    {
      key: 'patient',
      header: 'Patient',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.patient?.fullName ?? 'Patient'} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-navy-900">
              {row.patient?.fullName ?? 'Unknown patient'}
            </p>
            <p className="truncate text-xs text-muted">{row.patient?.email ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'record',
      header: 'Medical record',
      render: (row) => (
        <div className="flex min-w-0 items-start gap-2">
          <FileText size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-900">
              {row.record?.recordTitle ?? 'Not specified'}
            </p>
            <p className="truncate text-xs text-muted">{row.record?.category ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Access date',
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-slate-600">{formatDate(row.accessedAt)}</span>
      ),
    },
    {
      key: 'time',
      header: 'Access time',
      render: (row) => (
        <span className="whitespace-nowrap font-mono text-sm text-slate-600">
          {formatTime(row.accessedAt)}
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (row) => (
        <div>
          <StatusBadge status={row.accessResult} tone={row.accessResult === 'granted' ? 'success' : 'danger'} />
          {row.reason && <p className="mt-1 max-w-[16rem] text-xs text-muted">{row.reason}</p>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        title="Access history"
        subtitle="An audit log of every record access attempt you made, granted or denied."
        breadcrumb={[{ label: 'Doctor', to: '/doctor/dashboard' }, { label: 'Access history' }]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="card flex items-center gap-3 p-4">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', item.tone)}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm text-muted">{item.label}</p>
                <p className="text-xl font-semibold text-navy-900">{item.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Card className="mt-6" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <FilterDropdown
            id="history-result"
            label="Filter by result"
            value={result}
            onChange={onResult}
            options={RESULT_OPTIONS}
            allLabel="All results"
          />
        </div>

        {status === 'error' ? (
          <ErrorState
            title="We could not load your access history"
            message={error}
            onRetry={() => reload()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={entries}
              keyField="id"
              loading={status === 'loading'}
              skeletonRows={5}
              className="rounded-b-xl2"
              empty={
                <EmptyState
                  icon={Activity}
                  title="No access events yet"
                  description="Record access attempts are logged here as they occur. Access logs are read-only and can never be edited or deleted."
                />
              }
              footer="Every access attempt is an immutable audit event belonging to your account. No storage paths are shown."
            />
            {status === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="entry" />
            )}
          </>
        )}
      </Card>

      <div className="mt-4 flex items-start gap-2 rounded-xl2 border border-slate-200 bg-white px-4 py-3 text-xs text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
        <p>
          Access attempts are immutable audit events. On-chain consent re-verification is
          introduced in Phase 9.
        </p>
      </div>
    </>
  );
}
