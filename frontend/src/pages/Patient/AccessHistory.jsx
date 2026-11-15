import { useCallback, useMemo, useState } from 'react';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import FilterDropdown from '../../components/common/FilterDropdown';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import usePatientResource from '../../hooks/usePatientResource';
import { fetchAccessHistory } from '../../services/patientService';
import { formatDate, formatTime } from '../../utils/format';

const PAGE_SIZE = 10;

const RESULT_OPTIONS = [
  { label: 'Granted', value: 'granted' },
  { label: 'Denied', value: 'denied' },
];

const RESULT_LABELS = { granted: 'Granted', denied: 'Denied' };
const RESULT_TONES = { granted: 'success', denied: 'danger' };

export default function AccessHistory() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetcher = useCallback(
    () =>
      fetchAccessHistory({
        page,
        limit: PAGE_SIZE,
        result: result === 'all' ? undefined : result,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      }),
    [page, result, dateFrom, dateTo]
  );

  const { status: loadStatus, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load your access history.',
  });

  const entries = data?.entries ?? [];
  const counts = data?.counts;
  const pagination = data?.pagination;

  const onResult = (value) => {
    setResult(value);
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
        key: 'record',
        header: 'Medical Record',
        render: (entry) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-700">
              {entry.record?.recordTitle ?? 'Record no longer available'}
            </p>
            {entry.record?.id && (
              <p className="truncate font-mono text-xs text-muted">{entry.record.id}</p>
            )}
          </div>
        ),
      },
      { key: 'accessDate', header: 'Access Date', render: (entry) => formatDate(entry.accessedAt) },
      { key: 'accessTime', header: 'Access Time', render: (entry) => formatTime(entry.accessedAt) },
      {
        key: 'result',
        header: 'Access Result',
        render: (entry) => (
          <div className="min-w-0">
            <StatusBadge
              status={entry.accessResult}
              tone={RESULT_TONES[entry.accessResult] ?? 'neutral'}
            >
              {RESULT_LABELS[entry.accessResult] ?? entry.accessResult}
            </StatusBadge>
            {entry.reason && <p className="mt-1 text-xs text-muted">{entry.reason}</p>}
          </div>
        ),
      },
    ],
    []
  );

  const hasFilter = result !== 'all' || Boolean(dateFrom) || Boolean(dateTo);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Access History"
        subtitle="Every time a doctor opened one of your records — and every attempt that was blocked."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Accesses"
          value={pagination?.total ?? 0}
          icon={Activity}
          tone="navy"
          hint={hasFilter ? 'Matching your filters' : undefined}
        />
        <StatCard
          label="Granted"
          value={counts?.granted ?? 0}
          icon={CheckCircle2}
          tone="emerald"
          hint="All time"
        />
        <StatCard
          label="Denied"
          value={counts?.denied ?? 0}
          icon={XCircle}
          tone="red"
          hint="All time"
        />
      </div>

      <Card bodyClassName="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-muted">
            {pagination
              ? `${pagination.total} event${pagination.total === 1 ? '' : 's'}`
              : 'Access log'}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              id="access-history-result"
              label="Result"
              value={result}
              onChange={onResult}
              allLabel="All results"
              options={RESULT_OPTIONS}
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input w-auto py-2 text-sm"
                aria-label="Access date from"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
              />
              <span className="text-xs text-muted">to</span>
              <input
                type="date"
                className="input w-auto py-2 text-sm"
                aria-label="Access date to"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Access Log" bodyClassName="p-0">
        {loadStatus === 'error' ? (
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
              loading={loadStatus === 'loading'}
              skeletonRows={6}
              empty={
                <EmptyState
                  icon={Activity}
                  title="No access events found"
                  description={
                    hasFilter
                      ? 'Try a different result filter, date range or search term.'
                      : 'No doctor has accessed your records yet. Every future attempt will be logged here.'
                  }
                />
              }
            />
            {loadStatus === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="event" />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
