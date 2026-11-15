import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Ban, Clock, Eye, Mail, Phone, RefreshCw, ShieldAlert, UserCheck, Users, UserSearch } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import FilterDropdown from '../../components/common/FilterDropdown';
import Modal from '../../components/common/Modal';
import PageHeading from '../../components/common/PageHeading';
import SearchBar from '../../components/common/SearchBar';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import { apiErrorMessage } from '../../services/api';
import {
  ACCOUNT_STATUS_OPTIONS,
  fetchPatient,
  fetchPatients,
  toggledAccountStatus,
  updateUserStatus,
} from '../../services/adminService';
import usePatientResource from '../../hooks/usePatientResource';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { formatDate, formatNumber } from '../../utils/format';

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { label: 'Newest registered', value: 'createdAt:desc' },
  { label: 'Oldest registered', value: 'createdAt:asc' },
  { label: 'Name A–Z', value: 'fullName:asc' },
  { label: 'Name Z–A', value: 'fullName:desc' },
];

/** Detail row used inside the read-only account modal. */
function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="break-words text-sm font-medium text-navy-900">{value ?? '—'}</p>
      </div>
    </div>
  );
}

export default function ManagePatients() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [statusTarget, setStatusTarget] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const search = useDebouncedValue(query, 350);
  const [sortBy, sortOrder] = sort.split(':');

  const onSearch = (value) => {
    setQuery(value);
    setPage(1);
  };

  const fetcher = useCallback(
    () =>
      fetchPatients({
        page,
        limit: PAGE_SIZE,
        search: search ? search.slice(0, 120) : undefined,
        accountStatus: statusFilter === 'all' ? undefined : statusFilter,
        sortBy,
        sortOrder,
      }),
    [page, search, statusFilter, sortBy, sortOrder]
  );

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load the patient directory.',
  });

  const patients = data?.patients ?? [];
  const counts = data?.counts ?? { total: 0, active: 0, suspended: 0 };
  const pagination = data?.pagination;

  // Load the single-patient view from the dedicated endpoint.
  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return undefined;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError('');
    fetchPatient(detailId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((requestError) => {
        if (active) setDetailError(apiErrorMessage(requestError, 'Could not load this patient account.'));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [detailId]);

  const resetFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setSort('createdAt:desc');
    setPage(1);
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setStatusBusy(true);
    try {
      await updateUserStatus(statusTarget.patient.id, statusTarget.nextStatus);
      toast.success(
        statusTarget.nextStatus === 'suspended'
          ? 'Patient account suspended.'
          : 'Patient account reactivated.'
      );
      setStatusTarget(null);
      await reload({ silent: true });
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not update this account.'));
    } finally {
      setStatusBusy(false);
    }
  };

  const columns = [
    {
      key: 'fullName',
      header: 'Patient Name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.fullName} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-navy-900">{row.fullName}</p>
            <p className="max-w-[16rem] truncate font-mono text-xs text-muted">{row.id}</p>
          </div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (row) => <span className="text-slate-600">{row.email ?? '—'}</span> },
    {
      key: 'mobileNumber',
      header: 'Mobile',
      render: (row) => <span className="whitespace-nowrap">{row.mobileNumber ?? '—'}</span>,
    },
    { key: 'registeredAt', header: 'Registered', render: (row) => formatDate(row.registeredAt) },
    {
      key: 'accountStatus',
      header: 'Account Status',
      render: (row) => <StatusBadge status={row.accountStatus} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const canToggle = row.accountStatus === 'active' || row.accountStatus === 'suspended';
        return (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" icon={Eye} onClick={() => setDetailId(row.id)}>
              View
            </Button>
            {canToggle ? (
              <Button
                variant={row.accountStatus === 'suspended' ? 'success' : 'danger'}
                size="sm"
                icon={row.accountStatus === 'suspended' ? RefreshCw : Ban}
                onClick={() =>
                  setStatusTarget({ patient: row, nextStatus: toggledAccountStatus(row.accountStatus) })
                }
              >
                {row.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend'}
              </Button>
            ) : (
              <span className="text-xs text-muted">No action</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeading
        title="Manage Patients"
        subtitle="Review patient accounts and manage their access to the platform. Medical records are never visible to administrators."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Manage Patients' }]}
        actions={
          <Button variant="outline" icon={RefreshCw} onClick={() => reload()} loading={status === 'loading'}>
            Refresh
          </Button>
        }
      />

      {/* Summary strip - real aggregate counts for all patients */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Patients" value={formatNumber(counts.total ?? 0)} icon={Users} tone="navy" />
        <StatCard label="Active" value={formatNumber(counts.active ?? 0)} icon={UserCheck} tone="emerald" />
        <StatCard label="Suspended" value={formatNumber(counts.suspended ?? 0)} icon={Ban} tone="red" />
      </div>

      <Card className="mt-4" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            id="patient-search"
            value={query}
            onChange={onSearch}
            placeholder="Search by patient name or email…"
            className="lg:max-w-sm"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <FilterDropdown
              id="patient-status"
              label="Account status"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              options={ACCOUNT_STATUS_OPTIONS}
              allLabel="All statuses"
              className="sm:w-44"
            />
            <FilterDropdown
              id="patient-sort"
              label="Sort by"
              value={sort}
              onChange={setSort}
              options={SORT_OPTIONS}
              allLabel={null}
              className="sm:w-52"
            />
          </div>
        </div>

        {status === 'error' ? (
          <ErrorState
            title="We could not load the patient directory"
            message={error}
            onRetry={() => reload()}
          />
        ) : status === 'loading' ? (
          <DataTable columns={columns} data={[]} loading skeletonRows={PAGE_SIZE} />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={UserSearch}
            title="No patients match your filters"
            description="Try a different search term or reset the account-status and sort filters."
            action={
              <Button variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <DataTable columns={columns} data={patients} keyField="id" />
            <Pagination pagination={pagination} onPageChange={setPage} itemLabel="patient" />
          </>
        )}
      </Card>

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title="Patient profile"
        description="Non-clinical account details"
        icon={UserSearch}
        iconTone="navy"
        size="md"
        footer={
          <Button variant="outline" onClick={() => setDetailId(null)}>
            Close
          </Button>
        }
      >
        {detailLoading ? (
          <p className="py-8 text-center text-sm text-muted">Loading patient account…</p>
        ) : detailError ? (
          <ErrorState title="Could not load this account" message={detailError} onRetry={() => setDetailId(detailId)} />
        ) : detail ? (
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Avatar name={detail.fullName} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-navy-900">{detail.fullName}</h3>
                  <StatusBadge status={detail.accountStatus} />
                </div>
                <p className="max-w-[20rem] truncate font-mono text-xs text-muted">{detail.id}</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 pt-2">
              <DetailRow icon={Mail} label="Email address" value={detail.email} />
              <DetailRow icon={Phone} label="Mobile number" value={detail.mobileNumber} />
              <DetailRow icon={Clock} label="Registered on" value={formatDate(detail.registeredAt)} />
            </div>

            <div className="flex items-start gap-2.5 rounded-xl2 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                Administrators cannot open, download or export patient medical records. Records are
                accessible only to the patient and to clinicians holding an active consent.
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={confirmStatusChange}
        tone={statusTarget?.nextStatus === 'suspended' ? 'danger' : 'success'}
        loading={statusBusy}
        title={statusTarget?.nextStatus === 'suspended' ? 'Suspend this patient?' : 'Reactivate this patient?'}
        message={statusTarget ? statusTarget.patient.fullName : ''}
        confirmLabel={statusTarget?.nextStatus === 'suspended' ? 'Suspend account' : 'Reactivate account'}
      >
        <p className="text-sm text-muted">
          {statusTarget?.nextStatus === 'suspended'
            ? 'A suspended account cannot sign in or use any portal. This action is recorded in the activity log.'
            : 'The account will be able to sign in and use the patient portal again. This action is recorded in the activity log.'}
        </p>
      </ConfirmDialog>
    </>
  );
}
