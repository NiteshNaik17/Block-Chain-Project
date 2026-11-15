import { useCallback, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  Info,
  XCircle,
} from 'lucide-react';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import SearchBar from '../../components/common/SearchBar';
import FilterDropdown from '../../components/common/FilterDropdown';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import usePatientResource from '../../hooks/usePatientResource';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_OPTIONS,
  fetchRequests,
} from '../../services/doctorService';
import { cn, formatDate, formatDateTime } from '../../utils/format';

const PAGE_SIZE = 10;

const STATUS_TONES = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

/** Record requests the doctor raised, with the patient's decision. */
export default function MyRequests() {
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const search = useDebouncedValue(query, 350);

  const onStatus = (value) => {
    setStatus(value);
    setPage(1);
  };

  const onSearch = (value) => {
    setQuery(value);
    setPage(1);
  };

  const fetcher = useCallback(
    () =>
      fetchRequests({
        page,
        limit: PAGE_SIZE,
        status: status === 'all' ? undefined : status,
        search: search ? search.slice(0, 120) : undefined,
      }),
    [page, status, search]
  );

  const { status: loadStatus, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load your requests.',
  });

  const requests = data?.requests ?? [];
  const counts = data?.counts;
  const pagination = data?.pagination;

  const summary = [
    { key: 'total', label: 'Total', value: counts?.total ?? 0, icon: ClipboardList, tone: 'text-navy-700 bg-navy-50' },
    { key: 'pending', label: 'Pending', value: counts?.pending ?? 0, icon: Clock, tone: 'text-amber-700 bg-amber-50' },
    { key: 'approved', label: 'Approved', value: counts?.approved ?? 0, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
    { key: 'rejected', label: 'Rejected', value: counts?.rejected ?? 0, icon: XCircle, tone: 'text-red-700 bg-red-50' },
    { key: 'cancelled', label: 'Cancelled', value: counts?.cancelled ?? 0, icon: XCircle, tone: 'text-slate-600 bg-slate-100' },
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
      key: 'categories',
      header: 'Requested categories',
      render: (row) => (
        <div className="flex max-w-xs flex-wrap gap-1.5">
          {(row.requestedCategories ?? []).length === 0 ? (
            <span className="text-xs text-muted">—</span>
          ) : (
            row.requestedCategories.map((category) => (
              <span key={category} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                {category}
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'selected',
      header: 'Selected records',
      render: (row) => {
        const list = row.selectedRecords ?? [];
        if (list.length > 0) {
          return (
            <span className="text-sm text-slate-700">
              {list.length} record{list.length === 1 ? '' : 's'}
            </span>
          );
        }
        if (row.status === 'pending') {
          return <span className="text-xs text-muted">Awaiting the patient's selection</span>;
        }
        return <span className="text-xs text-muted">None</span>;
      },
    },
    {
      key: 'purpose',
      header: 'Purpose',
      render: (row) => (
        <p className="max-w-[200px] truncate text-sm text-slate-600" title={row.purpose}>
          {row.purpose}
        </p>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-slate-600">
          {row.requestedDuration ? `${row.requestedDuration} days` : '—'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Request date',
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-slate-600">{formatDate(row.requestedAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge status={row.status} tone={STATUS_TONES[row.status]}>
          {REQUEST_STATUS_LABELS[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button variant="ghost" size="sm" icon={Eye} onClick={() => setSelected(row)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        title="My requests"
        subtitle="Track the status of every record request you have sent to patients."
        breadcrumb={[{ label: 'Doctor', to: '/doctor/dashboard' }, { label: 'My requests' }]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summary.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="card flex items-center gap-3 p-4">
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', item.tone)}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-muted">{item.label}</p>
                <p className="text-lg font-semibold text-navy-900">{item.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Card className="mt-6" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <SearchBar
            id="request-search"
            value={query}
            onChange={onSearch}
            placeholder="Search by patient name…"
            className="sm:max-w-md sm:flex-1"
          />
          <FilterDropdown
            id="request-status"
            label="Filter by status"
            value={status}
            onChange={onStatus}
            options={REQUEST_STATUS_OPTIONS}
            allLabel="All statuses"
          />
        </div>

        {loadStatus === 'error' ? (
          <ErrorState
            title="We could not load your requests"
            message={error}
            onRetry={() => reload()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={requests}
              keyField="id"
              loading={loadStatus === 'loading'}
              skeletonRows={5}
              className="rounded-b-xl2"
              empty={
                <EmptyState
                  icon={ClipboardList}
                  title="No requests found"
                  description="Record requests you send to patients will appear here."
                />
              }
              footer="An approved request records the patient's decision only. Blockchain-backed consent with an expiry is created in Phase 9. Cancellation is unavailable until it is supported by the workflow."
            />
            {loadStatus === 'ready' && (
              <Pagination pagination={pagination} onPageChange={setPage} itemLabel="request" />
            )}
          </>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Request details"
        description={selected?.id}
        icon={ClipboardList}
        iconTone="navy"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={selected.patient?.fullName ?? 'Patient'} size="md" />
              <div className="min-w-0">
                <p className="truncate font-medium text-navy-900">
                  {selected.patient?.fullName ?? 'Unknown patient'}
                </p>
                <p className="truncate text-xs text-muted">{selected.patient?.email ?? '—'}</p>
              </div>
              <StatusBadge
                status={selected.status}
                tone={STATUS_TONES[selected.status]}
                className="ml-auto"
              >
                {REQUEST_STATUS_LABELS[selected.status] ?? selected.status}
              </StatusBadge>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Categories requested ({(selected.requestedCategories ?? []).length})
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(selected.requestedCategories ?? []).length === 0 ? (
                  <p className="text-sm text-muted">No categories recorded.</p>
                ) : (
                  selected.requestedCategories.map((category) => (
                    <span key={category} className="badge bg-slate-100 text-slate-600">
                      {category}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Purpose</p>
              <p className="mt-1 text-sm text-slate-700">{selected.purpose}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Records the patient chose to share ({(selected.selectedRecords ?? []).length})
              </p>
              {(selected.selectedRecords ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  {selected.status === 'pending'
                    ? 'The patient has not selected any records yet.'
                    : 'No records were shared.'}
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {selected.selectedRecords.map((record) => (
                    <li key={record.id} className="flex items-center gap-2 px-3 py-2.5">
                      <FileText size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        {record.recordTitle}
                      </span>
                      <span className="text-xs text-muted">{record.category ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Requested on
                </p>
                <p className="mt-0.5 text-sm font-medium text-navy-900">
                  {formatDateTime(selected.requestedAt)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Requested duration
                </p>
                <p className="mt-0.5 text-sm font-medium text-navy-900">
                  {selected.requestedDuration ? `${selected.requestedDuration} days` : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Patient decision
                </p>
                <p className="mt-0.5 text-sm font-medium text-navy-900">
                  {selected.patientDecision
                    ? REQUEST_STATUS_LABELS[selected.patientDecision] ?? selected.patientDecision
                    : 'Awaiting decision'}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Response date
                </p>
                <p className="mt-0.5 text-sm font-medium text-navy-900">
                  {selected.responseDate ? formatDateTime(selected.responseDate) : '—'}
                </p>
              </div>
            </div>

            {selected.rejectionReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-700">
                  Reason given for declining
                </p>
                <p className="mt-1 text-sm text-red-800">{selected.rejectionReason}</p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
              <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
              <p>
                {selected.blockchainBacked
                  ? 'This access is backed by an on-chain consent.'
                  : 'This is the patient’s recorded decision only — no blockchain-backed consent exists yet, and no document is downloadable. On-chain consent arrives in Phase 9.'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
