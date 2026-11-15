import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Ban,
  Clock,
  Eye,
  Mail,
  RefreshCw,
  ShieldAlert,
  UserCog,
  Users,
  UserCheck,
} from 'lucide-react';
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
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/tables/DataTable';
import Pagination from '../../components/tables/Pagination';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../services/api';
import {
  ACCOUNT_STATUS_OPTIONS,
  USER_ROLE_LABELS,
  USER_ROLE_OPTIONS,
  fetchUser,
  fetchUsers,
  toggledAccountStatus,
  updateUserStatus,
} from '../../services/adminService';
import usePatientResource from '../../hooks/usePatientResource';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { cn, formatDate, formatDateTime, formatNumber } from '../../utils/format';

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { label: 'Newest registered', value: 'createdAt:desc' },
  { label: 'Oldest registered', value: 'createdAt:asc' },
  { label: 'Name A–Z', value: 'fullName:asc' },
  { label: 'Name Z–A', value: 'fullName:desc' },
];

const ROLE_STYLES = {
  admin: 'bg-navy-50 text-navy-800 ring-navy-200',
  doctor: 'bg-teal-50 text-teal-700 ring-teal-200',
  patient: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function RoleBadge({ role }) {
  return (
    <span className={cn('badge ring-1 ring-inset', ROLE_STYLES[role] ?? ROLE_STYLES.patient)}>
      {USER_ROLE_LABELS[role] ?? role}
    </span>
  );
}

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

export default function ManageUsers() {
  const { user: currentAdmin } = useAuth();

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
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
      fetchUsers({
        page,
        limit: PAGE_SIZE,
        search: search ? search.slice(0, 120) : undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        accountStatus: statusFilter === 'all' ? undefined : statusFilter,
        sortBy,
        sortOrder,
      }),
    [page, search, roleFilter, statusFilter, sortBy, sortOrder]
  );

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load the user directory.',
  });

  const users = data?.users ?? [];
  const counts = data?.counts ?? { total: 0, byRole: {}, byStatus: {} };
  const pagination = data?.pagination;

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return undefined;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError('');
    fetchUser(detailId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((requestError) => {
        if (active) setDetailError(apiErrorMessage(requestError, 'Could not load this account.'));
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
    setRoleFilter('all');
    setStatusFilter('all');
    setSort('createdAt:desc');
    setPage(1);
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setStatusBusy(true);
    try {
      await updateUserStatus(statusTarget.user.id, statusTarget.nextStatus);
      toast.success(
        statusTarget.nextStatus === 'suspended' ? 'Account suspended.' : 'Account reactivated.'
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
      header: 'User',
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
    { key: 'role', header: 'Role', render: (row) => <RoleBadge role={row.role} /> },
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
        const isSelf = row.id === currentAdmin?.id;
        const isAdminAccount = row.role === 'admin';
        const canToggle =
          !isSelf &&
          !isAdminAccount &&
          (row.accountStatus === 'active' || row.accountStatus === 'suspended');

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
                onClick={() => setStatusTarget({ user: row, nextStatus: toggledAccountStatus(row.accountStatus) })}
              >
                {row.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend'}
              </Button>
            ) : (
              <span className="text-xs text-muted">
                {isSelf ? 'Your account' : isAdminAccount ? 'Admin account' : 'No action'}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  const roleCards = [
    { key: 'admin', label: 'Administrators', icon: ShieldAlert, tone: 'navy' },
    { key: 'doctor', label: 'Doctors', icon: UserCog, tone: 'teal' },
    { key: 'patient', label: 'Patients', icon: Users, tone: 'slate' },
  ];

  return (
    <>
      <PageHeading
        title="Manage Users"
        subtitle="Review every platform account and manage patient and doctor access. Roles and administrator accounts cannot be changed here."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Manage Users' }]}
        actions={
          <Button variant="outline" icon={RefreshCw} onClick={() => reload()} loading={status === 'loading'}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {roleCards.map((card) => {
          const Icon = card.icon;
          const toneClasses = {
            navy: 'bg-navy-50 text-navy-800',
            teal: 'bg-teal-50 text-teal-700',
            slate: 'bg-slate-100 text-slate-600',
          }[card.tone];
          return (
            <div key={card.key} className="card flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted">{card.label}</p>
                <p className="mt-1 text-xl font-semibold text-navy-900">
                  {formatNumber(counts.byRole?.[card.key] ?? 0)}
                </p>
              </div>
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses)}>
                <Icon size={18} aria-hidden="true" />
              </span>
            </div>
          );
        })}
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            id="user-search"
            value={query}
            onChange={onSearch}
            placeholder="Search by name or email…"
            className="lg:max-w-sm"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <FilterDropdown
              id="user-role"
              label="Role"
              value={roleFilter}
              onChange={(value) => {
                setRoleFilter(value);
                setPage(1);
              }}
              options={USER_ROLE_OPTIONS}
              allLabel="All roles"
              className="sm:w-40"
            />
            <FilterDropdown
              id="user-status"
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
              id="user-sort"
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
          <ErrorState title="We could not load the user directory" message={error} onRetry={() => reload()} />
        ) : status === 'loading' ? (
          <DataTable columns={columns} data={[]} loading skeletonRows={PAGE_SIZE} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users match your filters"
            description="Try a different search term or reset the role and status filters."
            action={
              <Button variant="outline" onClick={resetFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <DataTable columns={columns} data={users} keyField="id" />
            <Pagination pagination={pagination} onPageChange={setPage} itemLabel="account" />
          </>
        )}
      </Card>

      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
        Roles cannot be changed and administrator accounts cannot be suspended through user
        management. You cannot change the status of your own account.
      </p>

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title="User account"
        description="Read-only profile"
        icon={UserCog}
        iconTone="navy"
        size="md"
        footer={
          <Button variant="outline" onClick={() => setDetailId(null)}>
            Close
          </Button>
        }
      >
        {detailLoading ? (
          <p className="py-8 text-center text-sm text-muted">Loading account…</p>
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
                <p className="mt-1 max-w-[20rem] truncate font-mono text-xs text-muted">{detail.id}</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 pt-2">
              <DetailRow icon={Mail} label="Email address" value={detail.email} />
              <DetailRow icon={UserCog} label="Role" value={USER_ROLE_LABELS[detail.role] ?? detail.role} />
              <DetailRow icon={ShieldAlert} label="Account status" value={detail.accountStatus} />
              <DetailRow icon={Clock} label="Registered" value={formatDateTime(detail.registeredAt)} />
              {detail.role === 'doctor' && (
                <DetailRow
                  icon={UserCheck}
                  label="Verification status"
                  value={detail.verificationStatus ?? '—'}
                />
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-xl2 border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
              <p>
                Only patient and doctor accounts can be suspended or reactivated. Roles are enforced
                by the backend and cannot be changed through this screen.
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
        title={statusTarget?.nextStatus === 'suspended' ? 'Suspend this account?' : 'Reactivate this account?'}
        message={statusTarget ? `${statusTarget.user.fullName} · ${USER_ROLE_LABELS[statusTarget.user.role] ?? statusTarget.user.role}` : ''}
        confirmLabel={statusTarget?.nextStatus === 'suspended' ? 'Suspend account' : 'Reactivate account'}
      >
        <p className="text-sm text-muted">
          {statusTarget?.nextStatus === 'suspended'
            ? 'A suspended account cannot sign in or use any portal. This action is recorded in the activity log.'
            : 'The account will be able to sign in again. This action is recorded in the activity log.'}
        </p>
      </ConfirmDialog>
    </>
  );
}
