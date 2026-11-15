import { useCallback, useState } from 'react';
import { Activity, CalendarRange, Hash, Info, RefreshCw, ShieldCheck } from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import FilterDropdown from '../../components/common/FilterDropdown';
import PageHeading from '../../components/common/PageHeading';
import SearchBar from '../../components/common/SearchBar';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import { ACTOR_ROLE_LABELS, ACTOR_ROLE_OPTIONS, fetchActivityLogs } from '../../services/adminService';
import usePatientResource from '../../hooks/usePatientResource';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { cn, formatDateTime, formatNumber } from '../../utils/format';

const PAGE_SIZE = 10;
const SUMMARY_LIMIT = 8;

const TONE_DOT = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  accent: 'bg-teal-500',
  neutral: 'bg-slate-400',
};

/** Backend action strings look like `resource.verb`; map them onto a visual tone. */
function actionTone(action) {
  const value = String(action ?? '').toLowerCase();
  if (/rejected|denied|suspended|revoked|failed|deleted/.test(value)) return 'danger';
  if (/approved|verified|reactivated|granted/.test(value)) return 'success';
  if (/submitted|created|registered|uploaded|requested|invited/.test(value)) return 'info';
  if (/updated|login|logout|viewed|accessed/.test(value)) return 'accent';
  return 'neutral';
}

/** `access_request.submitted` -> `Access request submitted`. */
function actionLabel(action) {
  const raw = String(action ?? '').trim();
  if (!raw) return 'Unknown activity';
  const [resource, ...rest] = raw.split('.');
  const pretty = `${resource.replace(/_/g, ' ')} ${rest.join(' ').replace(/_/g, ' ')}`.trim();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

/** Safe, bounded rendering of an allow-listed metadata object. */
function MetadataChips({ metadata }) {
  const entries = Object.entries(metadata ?? {}).slice(0, 3);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
        >
          {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
        </span>
      ))}
    </div>
  );
}

export default function ActivityLogs() {
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const search = useDebouncedValue(query, 350);

  const fetcher = useCallback(
    () =>
      fetchActivityLogs({
        page,
        limit: PAGE_SIZE,
        search: search ? search.slice(0, 120) : undefined,
        action: actionFilter === 'all' ? undefined : actionFilter,
        actorRole: roleFilter === 'all' ? undefined : roleFilter,
        from: from || undefined,
        to: to || undefined,
      }),
    [page, search, actionFilter, roleFilter, from, to]
  );

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load the activity log.',
  });

  const logs = data?.logs ?? [];
  const counts = data?.counts ?? { total: 0, byAction: [] };
  const pagination = data?.pagination;

  const actionOptions = (counts.byAction ?? [])
    .filter((row) => row.action)
    .map((row) => ({ label: actionLabel(row.action), value: row.action }));

  const summary = (counts.byAction ?? []).slice(0, SUMMARY_LIMIT);

  const resetFilters = () => {
    setQuery('');
    setActionFilter('all');
    setRoleFilter('all');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const columns = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <StatusBadge tone={actionTone(row.action)}>{actionLabel(row.action)}</StatusBadge>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-navy-900">{row.actorName ?? 'System'}</p>
          <p className="text-xs text-muted">{ACTOR_ROLE_LABELS[row.actorRole] ?? row.actorRole ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      cellClassName: 'max-w-md',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-slate-600">{row.description ?? '—'}</p>
          <MetadataChips metadata={row.metadata} />
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) =>
        row.targetType ? (
          <div className="min-w-0">
            <p className="text-sm text-slate-600">{row.targetType}</p>
            {row.targetId && (
              <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                <Hash size={11} aria-hidden="true" />
                {row.targetId.slice(-8)}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'timestamp',
      header: 'Date & Time',
      render: (row) => (
        <span className="whitespace-nowrap text-slate-600">{formatDateTime(row.timestamp)}</span>
      ),
    },
  ];

  const dateInputClass = 'input py-2 text-sm';

  return (
    <>
      <PageHeading
        title="System Activity Logs"
        subtitle="Read-only audit trail of account, verification and access events across the platform."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'System Activity Logs' }]}
        actions={
          <Button variant="outline" icon={RefreshCw} onClick={() => reload()} loading={status === 'loading'}>
            Refresh
          </Button>
        }
      />

      {/* Summary strip by action */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {summary.map(({ action, count }) => {
          const tone = actionTone(action);
          return (
            <div key={action} className="card p-4">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[tone])} aria-hidden="true" />
                <p className="truncate text-xs font-medium text-muted" title={actionLabel(action)}>
                  {actionLabel(action)}
                </p>
              </div>
              <p className="mt-2 text-xl font-semibold text-navy-900">{formatNumber(count)}</p>
            </div>
          );
        })}
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-navy-500" aria-hidden="true" />
            <p className="truncate text-xs font-medium text-muted">Total entries</p>
          </div>
          <p className="mt-2 text-xl font-semibold text-navy-900">{formatNumber(counts.total ?? 0)}</p>
        </div>
      </div>

      <Card
        className="mt-4"
        title="Audit Entries"
        subtitle="Newest events across patient, doctor and admin portals"
        action={
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
            <ShieldCheck size={13} aria-hidden="true" /> Read-only
          </span>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            id="log-search"
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search by action, description or target…"
            className="lg:max-w-sm"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <FilterDropdown
              id="log-action"
              label="Action"
              value={actionFilter}
              onChange={(value) => {
                setActionFilter(value);
                setPage(1);
              }}
              options={actionOptions}
              allLabel="All actions"
              className="sm:w-56"
            />
            <FilterDropdown
              id="log-role"
              label="Actor role"
              value={roleFilter}
              onChange={(value) => {
                setRoleFilter(value);
                setPage(1);
              }}
              options={ACTOR_ROLE_OPTIONS}
              allLabel="All roles"
              className="sm:w-40"
            />
            <div className="relative sm:w-44">
              <CalendarRange
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="date"
                aria-label="From date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className={cn(dateInputClass, 'pl-9')}
              />
            </div>
            <div className="relative sm:w-44">
              <CalendarRange
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="date"
                aria-label="To date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className={cn(dateInputClass, 'pl-9')}
              />
            </div>
          </div>
        </div>

        {status === 'error' ? (
          <ErrorState title="We could not load the activity log" message={error} onRetry={() => reload()} />
        ) : status === 'loading' ? (
          <DataTable columns={columns} data={[]} loading skeletonRows={PAGE_SIZE} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity matches your filters"
            description="Try a different search term or reset the action, role and date filters."
            action={
              <Button variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <DataTable columns={columns} data={logs} keyField="id" />
            <Pagination pagination={pagination} onPageChange={setPage} itemLabel="entry" />
          </>
        )}
      </Card>

      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
        Audit entries are append-only and cannot be created, edited or deleted from this portal.
        Sensitive values such as credentials, tokens and medical record contents are never stored
        in the activity log.
      </p>
    </>
  );
}
