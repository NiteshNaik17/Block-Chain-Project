import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import { CardSkeleton, Skeleton } from '../../components/common/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { fetchDashboard } from '../../services/patientService';
import { apiErrorMessage } from '../../services/api';
import { cn, formatDate, formatRelative } from '../../utils/format';

const CHART_COLORS = ['#0D9488', '#082F49', '#31759f', '#14b8a6', '#d97706', '#94a3b8'];

const ACTIVITY_META = {
  consent: { icon: ShieldCheck, tone: 'bg-teal-50 text-teal-700' },
  access: { icon: Eye, tone: 'bg-sky-50 text-sky-700' },
  request: { icon: Send, tone: 'bg-amber-50 text-amber-700' },
  record: { icon: Upload, tone: 'bg-navy-50 text-navy-800' },
  default: { icon: Lock, tone: 'bg-slate-100 text-slate-600' },
};

const SECURITY_TONES = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Icon + tone for an ActivityLog action such as `access_request.approved`. */
function activityMeta(action = '') {
  const key = String(action).toLowerCase();
  if (key.includes('consent')) return ACTIVITY_META.consent;
  if (key.includes('access_request') || key.includes('request')) return ACTIVITY_META.request;
  if (key.includes('access')) return ACTIVITY_META.access;
  if (key.includes('record')) return ACTIVITY_META.record;
  return ACTIVITY_META.default;
}

function humaniseAction(action = '') {
  return String(action).replace(/[._]/g, ' ');
}

function ListSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function countFor(rows = [], status) {
  return rows.find((row) => row.status === status)?.count ?? 0;
}

export default function PatientDashboard() {
  const { user } = useAuth();

  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const dashboard = await fetchDashboard();
      setData(dashboard);
      setStatus('ready');
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Could not load your dashboard.'));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const dashboard = await fetchDashboard();
        if (!active) return;
        setData(dashboard);
        setStatus('ready');
      } catch (requestError) {
        if (!active) return;
        setError(apiErrorMessage(requestError, 'Could not load your dashboard.'));
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const firstName = (user?.fullName ?? 'there').split(' ')[0];

  const stats = data?.stats;
  const recentRecords = data?.recentRecords ?? [];
  const pendingRequests = useMemo(
    () => (data?.recentRequests ?? []).filter((request) => request.status === 'pending').slice(0, 3),
    [data]
  );
  const recentActivity = data?.recentActivity ?? [];

  const categoryData = useMemo(
    () =>
      (stats?.recordsByCategory ?? []).map((row) => ({ name: row.category, value: row.count })),
    [stats]
  );

  const totalRecords = stats?.totalRecords ?? 0;
  const encryptedRecords = countFor(stats?.recordsByEncryption, 'encrypted');
  const digestedRecords = countFor(stats?.recordsByIntegrity, 'recorded');

  // Every tile reflects a real, stored value - nothing is decorative.
  const securityOverview = [
    {
      id: 'encryption',
      label: 'Record encryption',
      value: totalRecords === 0 ? 'No records yet' : `${encryptedRecords} of ${totalRecords} encrypted`,
      detail: 'AES-256-GCM authenticated encryption with a unique IV per document.',
      tone: encryptedRecords === totalRecords && totalRecords > 0 ? 'success' : 'warning',
    },
    {
      id: 'integrity',
      label: 'Integrity digests',
      value: totalRecords === 0 ? 'No records yet' : `${digestedRecords} of ${totalRecords} recorded`,
      detail: 'SHA-256 digests verify original file integrity on download.',
      tone: digestedRecords === totalRecords && totalRecords > 0 ? 'success' : 'warning',
    },
    {
      id: 'account',
      label: 'Account status',
      value: user?.accountStatus ? user.accountStatus : 'Unknown',
      detail: 'Sessions use a signed HttpOnly cookie; no token is stored in the browser.',
      tone: user?.accountStatus === 'active' ? 'success' : 'warning',
    },
    {
      id: 'blockchain',
      label: 'Blockchain consent',
      value: stats?.activeConsents ? `${stats.activeConsents} active` : 'Not enabled yet',
      detail: 'On-chain consent granting is implemented in Phase 9.',
      tone: 'warning',
    },
  ];

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <PageHeading
          title="Dashboard"
          subtitle="Your medical records, consents and access activity at a glance."
        />
        <Card>
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle size={22} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-navy-900">We could not load your dashboard</h3>
              <p className="mt-1 text-sm text-muted">{error}</p>
            </div>
            <Button variant="primary" icon={RefreshCw} onClick={load}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const loading = status === 'loading';

  return (
    <div className="space-y-6">
      <PageHeading
        title="Dashboard"
        subtitle="Your medical records, consents and access activity at a glance."
        actions={
          <Button variant="outline" size="sm" icon={FileText} to="/patient/records">
            View all records
          </Button>
        }
      />

      {/* Welcome banner */}
      <section className="overflow-hidden rounded-xl2 bg-navy-900 p-6 text-white shadow-card sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-teal-300">
              {greeting}, {firstName}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              Your health data stays under your control
            </h2>
            <p className="mt-2 max-w-xl text-sm text-navy-100">
              Review who has asked for access and record your decision. Secure file uploads and
              blockchain-backed consents are enabled in later phases.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="accent" icon={Send} to="/patient/requests">
                Review requests
              </Button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4 rounded-xl2 bg-white/5 px-5 py-4 ring-1 ring-inset ring-white/10">
            <Avatar name={user?.fullName ?? 'Patient'} src={user?.profilePhoto ?? undefined} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {user?.fullName ?? 'Patient'}
              </p>
              <p className="truncate text-xs text-navy-100">{user?.email ?? ''}</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-teal-300">
                <ShieldCheck size={13} aria-hidden="true" />
                Access controlled by you
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stat cards */}
      {loading ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Medical Records"
            value={stats.totalRecords}
            icon={FileText}
            tone="navy"
            hint="Stored against your account"
            to="/patient/records"
          />
          <StatCard
            label="Pending Doctor Requests"
            value={stats.pendingRequests}
            icon={Send}
            tone="amber"
            hint="Awaiting your decision"
            to="/patient/requests"
          />
          <StatCard
            label="Active Consents"
            value={stats.activeConsents}
            icon={ShieldCheck}
            tone="teal"
            hint="Blockchain-backed consent arrives in Phase 9"
            to="/patient/consents"
          />
          <StatCard
            label="Expiring Consents"
            value={stats.expiringConsents}
            icon={Clock}
            tone="red"
            hint={`Expiring within ${stats.expiringWindowDays} days`}
            to="/patient/consents"
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Records by Category" subtitle="Distribution of your stored records">
          <div className="h-[260px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : categoryData.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No records yet"
                description="Upload medical records to visualize categories."
                className="h-full"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Activity Trend" subtitle="Your recorded activity (last 6 months)">
          <div className="h-[260px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.activityTrend}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar
                    dataKey="count"
                    name="Activity events"
                    fill="#0D9488"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Two-column content */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card
            title="Recent Medical Records"
            subtitle="Your latest records"
            action={
              <Button variant="ghost" size="sm" to="/patient/records">
                View all
              </Button>
            }
            bodyClassName="p-0"
          >
            {loading ? (
              <div className="px-5 py-3.5">
                <ListSkeleton rows={3} />
              </div>
            ) : recentRecords.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No records yet"
                description="Your vault is currently empty. Upload your first medical record."
                className="py-10"
                action={
                  <Button variant="outline" size="sm" to="/patient/records">
                    Go to Medical Records
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentRecords.map((record) => (
                  <li key={record.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
                      <FileText size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-900">{record.recordTitle}</p>
                      <p className="truncate text-xs text-muted">
                        {record.category} · {record.hospitalName}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-xs text-muted">{formatDate(record.reportDate)}</p>
                      <StatusBadge
                        status={record.recordStatus}
                        className="mt-1"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Consent Summary"
            subtitle="Your recorded consent status"
            action={
              <Button variant="ghost" size="sm" to="/patient/consents">
                View all
              </Button>
            }
          >
            {loading ? (
              <ListSkeleton rows={2} />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl2 border border-slate-200 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Active</p>
                    <p className="mt-1 text-xl font-semibold text-navy-900">{stats.activeConsents}</p>
                  </div>
                  <div className="rounded-xl2 border border-slate-200 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Expiring soon
                    </p>
                    <p className="mt-1 text-xl font-semibold text-navy-900">
                      {stats.expiringConsents}
                    </p>
                  </div>
                </div>
                <p className="rounded-xl2 bg-slate-50 p-3.5 text-xs text-muted">
                  Approving an access request records your decision. A blockchain-backed consent
                  with an on-chain transaction is created in Phase 9, so no consent here is
                  on-chain yet.
                </p>
              </div>
            )}
          </Card>

          <Card title="Security Overview" subtitle="How your data is protected right now">
            <div className="grid gap-3 sm:grid-cols-2">
              {securityOverview.map((item) => (
                <div key={item.id} className="rounded-xl2 border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      {item.label}
                    </p>
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-md',
                        SECURITY_TONES[item.tone] ?? SECURITY_TONES.warning
                      )}
                    >
                      <ShieldCheck size={13} aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-navy-900">
                    {loading ? <Skeleton className="h-4 w-24" /> : item.value}
                  </p>
                  {!loading && <p className="mt-0.5 text-xs text-muted">{item.detail}</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Doctor Access Requests"
            subtitle="Pending your approval"
            action={
              <Button variant="ghost" size="sm" to="/patient/requests">
                View all
              </Button>
            }
          >
            {loading ? (
              <ListSkeleton rows={2} />
            ) : pendingRequests.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No pending requests"
                description="You have reviewed every doctor access request."
              />
            ) : (
              <ul className="space-y-4">
                {pendingRequests.map((request) => (
                  <li key={request.id} className="rounded-xl2 border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={request.doctor?.fullName ?? 'Doctor'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy-900">
                          {request.doctor?.fullName ?? 'Unknown doctor'}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {[request.doctor?.specialization, request.doctor?.hospitalName]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>

                    <p className="mt-3 line-clamp-2 text-xs text-muted">{request.purpose}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {request.requestedRecords.map((record) => (
                        <span
                          key={record.id}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                        >
                          {record.recordTitle}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-400">
                        Requested {formatRelative(request.requestedAt)}
                      </span>
                      <Button variant="primary" size="sm" icon={Send} to="/patient/requests">
                        Review request
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent Activities" subtitle="Latest changes to your data access">
            {loading ? (
              <ListSkeleton rows={3} />
            ) : recentActivity.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No activity yet"
                description="Your sign-ins, decisions and profile changes will appear here."
              />
            ) : (
              <ol className="relative space-y-5 pl-1">
                {recentActivity.map((item) => {
                  const meta = activityMeta(item.action);
                  const Icon = meta.icon;
                  return (
                    <li key={item.id} className="flex gap-3.5">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          meta.tone
                        )}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-navy-900">{item.description}</p>
                          <span className="shrink-0 text-xs text-muted">
                            {formatRelative(item.timestamp)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs capitalize text-muted">
                          {humaniseAction(item.action)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
