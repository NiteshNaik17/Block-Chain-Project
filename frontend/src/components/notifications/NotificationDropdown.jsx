import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Bell, CheckCheck } from 'lucide-react';
import Dropdown from '../common/Dropdown';
import EmptyState from '../common/EmptyState';
import { Skeleton } from '../common/LoadingSkeleton';
import Button from '../common/Button';
import usePatientResource from '../../hooks/usePatientResource';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/patientService';
import {
  fetchNotifications as fetchDoctorNotifications,
  markAllNotificationsRead as markAllDoctorNotificationsRead,
  markNotificationRead as markDoctorNotificationRead,
} from '../../services/doctorService';
import {
  fetchNotifications as fetchAdminNotifications,
  markAllNotificationsRead as markAllAdminNotificationsRead,
  markNotificationRead as markAdminNotificationRead,
} from '../../services/adminService';
import { apiErrorMessage } from '../../services/api';
import { cn, formatRelative } from '../../utils/format';

const TYPE_TONES = {
  request: 'bg-sky-100 text-sky-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  success: 'bg-emerald-100 text-emerald-700',
  access: 'bg-navy-100 text-navy-700',
};

/** Backend Notification.notificationType -> a visual tone. */
const NOTIFICATION_TYPE_TONES = {
  consent_request: 'request',
  consent_approved: 'success',
  consent_rejected: 'error',
  consent_revoked: 'warning',
  access_granted: 'access',
  access_denied: 'error',
  record_uploaded: 'access',
  doctor_verified: 'success',
  doctor_rejected: 'error',
  system: 'access',
};

/** Bell button + unread badge. Lives outside Dropdown so the count always shows. */
function BellTrigger({ unread }) {
  return (
    <button
      type="button"
      className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
    >
      <Bell size={18} />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {unread}
        </span>
      )}
    </button>
  );
}

/**
 * Presentational panel shared by the API-backed (patient) and local (demo)
 * variants. `status` is one of loading | ready | error.
 */
function NotificationPanel({
  status,
  notifications,
  unread,
  busy,
  onMarkAllRead,
  onMarkRead,
  onRetry,
  footer,
  width,
}) {
  return (
    <Dropdown width={width} panelClassName="overflow-hidden p-0" trigger={<BellTrigger unread={unread} />}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-navy-900">Notifications</p>
          <p className="text-xs text-muted">{unread} unread</p>
        </div>
        {unread > 0 && status === 'ready' && (
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 disabled:opacity-60"
          >
            <CheckCheck size={13} />
            Mark all read
          </button>
        )}
      </div>

      <div className="scroll-slim max-h-80 overflow-y-auto">
        {status === 'loading' ? (
          <div className="space-y-3 p-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : status === 'error' ? (
          <EmptyState
            icon={AlertTriangle}
            title="Could not load notifications"
            description="Please try again."
            action={
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            }
            className="py-8"
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="You are all caught up."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => !item.read && onMarkRead?.(item.id)}
                  disabled={busy && !item.read}
                  className={cn(
                    'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50',
                    !item.read && 'bg-teal-50/40'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      TYPE_TONES[item.type] ?? TYPE_TONES.access
                    )}
                  >
                    <Bell size={14} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-navy-900">{item.title}</span>
                      {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{item.message}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {formatRelative(item.at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center">
        <span className="text-[11px] text-muted">{footer}</span>
      </div>
    </Dropdown>
  );
}

/**
 * Per-portal API adapters. Each portal keeps its own authenticated endpoint and
 * its own (identical-shaped) notification payload.
 */
const API_SOURCES = {
  patient: {
    fetch: (params) => fetchNotifications(params),
    markRead: (id) => markNotificationRead(id),
    markAllRead: () => markAllNotificationsRead(),
    footer: 'Stored on your MediConsent account.',
  },
  doctor: {
    fetch: (params) => fetchDoctorNotifications(params),
    markRead: (id) => markDoctorNotificationRead(id),
    markAllRead: () => markAllDoctorNotificationsRead(),
    footer: 'Stored on your MediConsent account.',
  },
  admin: {
    fetch: (params) => fetchAdminNotifications(params),
    markRead: (id) => markAdminNotificationRead(id),
    markAllRead: () => markAllAdminNotificationsRead(),
    footer: 'Stored on your MediConsent account.',
  },
};

/** API-backed notifications for an authenticated patient or doctor. */
function ApiNotifications({ width, source = 'patient' }) {
  const adapter = API_SOURCES[source] ?? API_SOURCES.patient;
  const { status, data, reload } = usePatientResource(
    () => adapter.fetch({ limit: 10 }),
    [source],
    { fallbackMessage: 'Could not load notifications.' }
  );
  const [busy, setBusy] = useState(false);

  const notifications = useMemo(
    () =>
      (data?.notifications ?? []).map((notification) => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        at: notification.createdAt,
        read: notification.isRead,
        type: NOTIFICATION_TYPE_TONES[notification.notificationType] ?? 'access',
      })),
    [data]
  );

  const handleMarkAllRead = async () => {
    setBusy(true);
    try {
      await adapter.markAllRead();
      await reload({ silent: true });
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not mark notifications as read.'));
    } finally {
      setBusy(false);
    }
  };

  const handleMarkRead = async (id) => {
    setBusy(true);
    try {
      await adapter.markRead(id);
      await reload({ silent: true });
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not mark this notification as read.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <NotificationPanel
      width={width}
      status={status}
      notifications={notifications}
      unread={data?.unreadCount ?? 0}
      busy={busy}
      onMarkAllRead={handleMarkAllRead}
      onMarkRead={handleMarkRead}
      onRetry={() => reload()}
      footer={adapter.footer}
    />
  );
}

/**
 * Bell icon + panel of in-app notifications.
 *
 * `source` selects a real, cookie-authenticated API source: "patient"
 * (`GET /api/v1/patient/notifications`), "doctor"
 * (`GET /api/v1/doctor/notifications`) or "admin"
 * (`GET /api/v1/admin/notifications`).
 */
export default function NotificationDropdown({ width = 'w-[22rem]', source }) {
  return <ApiNotifications width={width} source={source} />;
}
