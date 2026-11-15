import { useCallback } from 'react';
import {
  Ban,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import ErrorState from '../../components/common/ErrorState';
import PageHeading from '../../components/common/PageHeading';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import { Skeleton } from '../../components/common/LoadingSkeleton';
import usePatientResource from '../../hooks/usePatientResource';
import { useAuth } from '../../context/AuthContext';
import { fetchDashboard, fetchPendingDoctors } from '../../services/adminService';
import { formatDate, formatDateTime, formatNumber } from '../../utils/format';

/** Audit action -> badge tone. Derived from the action string; never hard-coded data. */
function actionTone(action = '') {
  const value = String(action).toLowerCase();
  if (/(reject|denied|suspend|revoke|blocked)/.test(value)) return 'danger';
  if (/(approve|verified|granted|register|login|reactivat)/.test(value)) return 'success';
  if (/(upload|create|update|profile|request|consent)/.test(value)) return 'info';
  return 'neutral';
}

function StatSkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="card p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <Skeleton className="mt-4 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const fetcher = useCallback(async () => {
    const [dashboard, pending] = await Promise.all([
      fetchDashboard(),
      fetchPendingDoctors({ limit: 5 }),
    ]);
    return {
      stats: dashboard?.stats ?? {},
      recentActivity: dashboard?.recentActivity ?? [],
      pendingDoctors: pending?.doctors ?? [],
      pendingCount: pending?.counts?.pending ?? 0,
    };
  }, []);

  const { status, data, error, reload } = usePatientResource(fetcher, [fetcher], {
    fallbackMessage: 'Could not load the admin dashboard.',
  });

  const stats = data?.stats ?? {};
  const recentActivity = data?.recentActivity ?? [];
  const pendingDoctors = data?.pendingDoctors ?? [];

  const cards = [
    { label: 'Total Patients', value: stats.totalPatients, icon: Users, tone: 'navy', to: '/admin/patients', hint: 'Registered patient accounts' },
    { label: 'Total Doctors', value: stats.totalDoctors, icon: Stethoscope, tone: 'teal', to: '/admin/verify-doctors', hint: 'Registered clinician accounts' },
    { label: 'Verified Doctors', value: stats.verifiedDoctors, icon: ShieldCheck, tone: 'emerald', to: '/admin/verify-doctors', hint: 'Clinicians approved by an admin' },
    { label: 'Pending Verifications', value: stats.pendingDoctorVerifications, icon: BadgeCheck, tone: 'amber', to: '/admin/verify-doctors', hint: 'Applications awaiting review' },
    { label: 'Rejected Doctors', value: stats.rejectedDoctors, icon: XCircle, tone: 'red', to: '/admin/verify-doctors', hint: 'Applications not approved' },
    { label: 'Active Users', value: stats.activeUsers, icon: UserCheck, tone: 'emerald', to: '/admin/users', hint: 'Accounts able to sign in' },
    { label: 'Suspended Users', value: stats.suspendedUsers, icon: Ban, tone: 'red', to: '/admin/users', hint: 'Accounts with access revoked' },
    { label: 'Active Consents', value: stats.activeConsents, icon: ScrollText, tone: 'sky', hint: 'Consents currently in force' },
    { label: 'Total Access Requests', value: stats.totalAccessRequests, icon: Send, tone: 'navy', hint: 'All-time doctor record requests' },
    { label: 'Pending Access Requests', value: stats.pendingAccessRequests, icon: Clock, tone: 'amber', hint: 'Awaiting a patient decision' },
    { label: 'Approved Requests', value: stats.approvedAccessRequests, icon: CheckCircle2, tone: 'emerald', hint: 'Requests a patient approved' },
    { label: 'Rejected Requests', value: stats.rejectedAccessRequests, icon: XCircle, tone: 'red', hint: 'Requests a patient declined' },
  ];

  return (
    <>
      <PageHeading
        title="Dashboard"
        subtitle="Overview of platform accounts, verification queue and recent system activity."
        breadcrumb={[{ label: 'Admin Portal' }, { label: 'Dashboard' }]}
        actions={
          <Button variant="outline" icon={RefreshCw} onClick={() => reload()} loading={status === 'loading'}>
            Refresh
          </Button>
        }
      />

      {/* Welcome banner */}
      <section className="rounded-xl2 border border-navy-800 bg-navy-900 p-5 text-white shadow-card sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={user?.fullName ?? 'Administrator'} size="lg" className="ring-2 ring-white/20" />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-300">Administrator</p>
              <h2 className="mt-0.5 text-lg font-semibold text-white">
                Welcome back, {user?.fullName ?? 'Administrator'}
              </h2>
              <p className="mt-0.5 truncate text-sm text-slate-300">
                {user?.email ?? 'Administrator account'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl2 bg-white/5 p-3 text-xs leading-relaxed text-slate-200 sm:max-w-xs">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-teal-300" aria-hidden="true" />
            <p>
              Administrators manage accounts and verification only. They never receive automatic
              access to patient medical records.
            </p>
          </div>
        </div>
      </section>

      {status === 'error' ? (
        <Card className="mt-4" bodyClassName="p-0">
          <ErrorState title="We could not load the dashboard" message={error} onRetry={() => reload()} />
        </Card>
      ) : status === 'loading' ? (
        <>
          <div className="mt-4">
            <StatSkeletonGrid />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="card space-y-3 p-5">
                <Skeleton className="h-4 w-40" />
                {Array.from({ length: 3 }).map((__, row) => (
                  <Skeleton key={row} className="h-10 w-full" />
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Overview stats - every value comes straight from MongoDB. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={formatNumber(card.value ?? 0)}
                icon={card.icon}
                tone={card.tone}
                hint={card.hint}
                to={card.to}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card
              title="Pending Doctor Verification"
              subtitle={`${formatNumber(data?.pendingCount ?? 0)} submissions awaiting review`}
              action={
                <Button variant="outline" size="sm" to="/admin/verify-doctors" iconRight={ChevronRight}>
                  Review all
                </Button>
              }
            >
              {pendingDoctors.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  There are no doctor applications awaiting verification.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pendingDoctors.map((doctor) => (
                    <li
                      key={doctor.id}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={doctor.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-navy-900">{doctor.fullName}</p>
                          <p className="truncate text-xs text-muted">
                            <span className="font-mono">
                              {doctor.medicalRegistrationNumber ?? 'No registration number'}
                            </span>
                            {doctor.specialization ? ` · ${doctor.specialization}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted">{formatDate(doctor.registeredAt)}</span>
                        <Button variant="ghost" size="sm" to="/admin/verify-doctors" iconRight={ChevronRight}>
                          Review
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Recent Platform Activity"
              subtitle="Most recent audit entries across all portals"
              action={
                <Button variant="ghost" size="sm" to="/admin/activity-logs" iconRight={ChevronRight}>
                  All logs
                </Button>
              }
            >
              {recentActivity.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No platform activity recorded yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentActivity.map((log) => (
                    <li
                      key={log.id}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={actionTone(log.action)}>{log.action}</StatusBadge>
                          <span className="text-xs text-muted">
                            {log.actorName ?? 'System'} · {log.actorRole}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{log.description}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{formatDateTime(log.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
