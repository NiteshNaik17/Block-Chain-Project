import { Link } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  FolderOpen,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageHeading from '../../components/common/PageHeading';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { CardSkeleton, Skeleton, TableSkeleton } from '../../components/common/LoadingSkeleton';
import usePatientResource from '../../hooks/usePatientResource';
import { fetchDashboard } from '../../services/doctorService';
import { useAuth } from '../../context/AuthContext';
import { cn, formatDate } from '../../utils/format';

const QUICK_ACTIONS = [
  { id: 'QA-1', label: 'Find a patient', to: '/doctor/patients', icon: Search },
  { id: 'QA-2', label: 'Request records', to: '/doctor/request-records', icon: Send },
  { id: 'QA-3', label: 'View accessible records', to: '/doctor/accessible-records', icon: FolderOpen },
  { id: 'QA-4', label: 'Check access history', to: '/doctor/access-history', icon: Activity },
];

/** Maps a stored activity action to an icon tone + readable title. */
const ACTIVITY_STYLES = {
  request: { icon: Send, tone: 'bg-sky-50 text-sky-700' },
  access: { icon: Eye, tone: 'bg-teal-50 text-teal-700' },
  consent: { icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-700' },
  verification: { icon: BadgeCheck, tone: 'bg-navy-50 text-navy-800' },
};

function describeActivity(action = '') {
  switch (action) {
    case 'access_request.submitted':
      return { type: 'request', title: 'Access request submitted' };
    case 'access_request.approved':
      return { type: 'consent', title: 'Access request approved' };
    case 'access_request.rejected':
      return { type: 'request', title: 'Access request declined' };
    case 'doctor.profile_updated':
      return { type: 'verification', title: 'Profile updated' };
    case 'auth.login':
      return { type: 'access', title: 'Signed in' };
    default:
      return { type: 'access', title: 'Activity' };
  }
}

/** Doctor landing page — real statistics, requests, activity and quick links. */
export default function DoctorDashboard() {
  const { user } = useAuth();
  const { status, data, error, reload } = usePatientResource(() => fetchDashboard(), [], {
    fallbackMessage: 'Could not load your dashboard.',
  });

  const stats = data?.stats;
  const recentRequests = data?.recentRequests ?? [];
  const recentActivity = data?.recentActivity ?? [];
  const requestTrend = data?.requestTrend ?? [];

  const doctorName = user?.fullName ?? 'Doctor';
  const doctorSubtitle =
    [user?.specialization, user?.hospitalName].filter(Boolean).join(' · ') || 'Verified practitioner';

  return (
    <>
      <PageHeading
        title="Dashboard"
        subtitle="A snapshot of your record requests, granted access and recent activity."
        breadcrumb={[{ label: 'Doctor', to: '/doctor/dashboard' }, { label: 'Dashboard' }]}
      />

      <section className="overflow-hidden rounded-xl2 bg-navy-900 p-6 text-white shadow-card sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={doctorName} src={user?.profilePhoto ?? undefined} size="xl" className="ring-2 ring-white/20" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-300">Welcome back</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{doctorName}</h2>
              <p className="mt-1 text-sm text-slate-300">{doctorSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button to="/doctor/patients" variant="outline" icon={Search}>
              Find a patient
            </Button>
            <Button to="/doctor/request-records" variant="accent" icon={Send}>
              Request records
            </Button>
          </div>
        </div>
      </section>

      {status === 'error' ? (
        <Card className="mt-6" bodyClassName="p-0">
          <ErrorState title="We could not load your dashboard" message={error} onRetry={() => reload()} />
        </Card>
      ) : (
        <>
          {status === 'loading' ? (
            <div className="mt-6">
              <CardSkeleton count={5} />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Total requests"
                value={stats?.totalRequests ?? 0}
                icon={ClipboardList}
                tone="navy"
                hint="All record requests you sent"
                to="/doctor/requests"
              />
              <StatCard
                label="Pending requests"
                value={stats?.pendingRequests ?? 0}
                icon={Clock}
                tone="amber"
                hint="Awaiting a patient decision"
                to="/doctor/requests"
              />
              <StatCard
                label="Approved requests"
                value={stats?.approvedRequests ?? 0}
                icon={CheckCircle2}
                tone="emerald"
                hint="Patients recorded a decision"
                to="/doctor/requests"
              />
              <StatCard
                label="Rejected requests"
                value={stats?.rejectedRequests ?? 0}
                icon={XCircle}
                tone="red"
                hint="Declined by the patient"
                to="/doctor/requests"
              />
              <StatCard
                label="Accessible records"
                value={stats?.accessibleRecords ?? 0}
                icon={FolderOpen}
                tone="teal"
                hint="On-chain consent only (Phase 9)"
                to="/doctor/accessible-records"
              />
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title="Request activity"
              subtitle="Records requested versus approved over the last 6 months"
            >
              {status === 'loading' ? (
                <Skeleton className="h-[260px] w-full" />
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={requestTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="requests" name="Requested" fill="#0F766E" radius={[6, 6, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="approved" name="Approved" fill="#5EEAD4" radius={[6, 6, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Quick actions" subtitle="Jump straight to a task">
              <div className="grid grid-cols-2 gap-3">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.id}
                      to={action.to}
                      className="card card-hover flex flex-col gap-2 p-4 outline-none"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="text-sm font-medium leading-snug text-navy-900">
                        {action.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Card>

            <Card
              className="lg:col-span-2"
              title="Recent requests"
              subtitle="Your latest record requests"
              footer={
                <Link
                  to="/doctor/requests"
                  className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
                >
                  View all requests
                  <ChevronRight size={14} aria-hidden="true" />
                </Link>
              }
            >
              {status === 'loading' ? (
                <TableSkeleton rows={4} columns={3} />
              ) : recentRequests.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No requests yet"
                  description="Requests you send to patients will appear here."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentRequests.map((request) => {
                    const categories = request.requestedCategories ?? [];
                    const recordCount = request.selectedRecordCount ?? 0;
                    return (
                      <li key={request.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <Avatar name={request.patient?.fullName ?? 'Patient'} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium text-navy-900">
                              {request.patient?.fullName ?? 'Unknown patient'}
                            </p>
                            <StatusBadge status={request.status} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {categories.length > 0
                              ? `${categories.join(', ')}`
                              : `${recordCount} record${recordCount === 1 ? '' : 's'}`}{' '}
                            · {formatDate(request.requestedAt)}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted">{request.purpose}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Recent activities" subtitle="Requests, profile changes and sign-ins">
              {status === 'loading' ? (
                <div className="space-y-4" aria-hidden="true">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex gap-3">
                      <Skeleton className="h-9 w-9 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No recent activity"
                  description="Your requests, profile changes and sign-ins are recorded here."
                />
              ) : (
                <ol className="space-y-4">
                  {recentActivity.map((entry) => {
                    const { type, title } = describeActivity(entry.action);
                    const style = ACTIVITY_STYLES[type] ?? ACTIVITY_STYLES.access;
                    const Icon = style.icon;
                    return (
                      <li key={entry.id} className="flex gap-3">
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            style.tone
                          )}
                        >
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-navy-900">{title}</p>
                          <p className="mt-0.5 text-xs text-muted">{entry.description}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
                            {formatDate(entry.timestamp)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
