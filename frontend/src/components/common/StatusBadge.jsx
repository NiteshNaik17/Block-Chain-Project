import { cn } from '../../utils/format';

const TONES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  accent: 'bg-teal-50 text-teal-700 ring-teal-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const DOTS = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  accent: 'bg-teal-500',
  neutral: 'bg-slate-400',
};

/** Status string -> visual tone. Keys are lowercase. */
const STATUS_TONES = {
  active: 'success',
  approved: 'success',
  granted: 'success',
  verified: 'success',
  complete: 'success',
  completed: 'success',
  connected: 'success',
  pending: 'warning',
  'expiring soon': 'warning',
  expiring: 'warning',
  'under review': 'warning',
  'action required': 'warning',
  rejected: 'danger',
  revoked: 'danger',
  expired: 'danger',
  denied: 'danger',
  failed: 'danger',
  suspended: 'danger',
  blocked: 'danger',
  inactive: 'neutral',
  draft: 'neutral',
  archived: 'neutral',
  unknown: 'neutral',
};

/**
 * Small pill used for record / consent / request / account statuses.
 * Pass `tone` to override the automatic mapping.
 */
export default function StatusBadge({ status, tone, dot = true, className, children }) {
  const key = String(status ?? '').trim().toLowerCase();
  const resolved = tone ?? STATUS_TONES[key] ?? 'neutral';
  const palette = TONES[resolved] ?? TONES.neutral;

  return (
    <span className={cn('badge ring-1 ring-inset', palette, className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[resolved])} aria-hidden="true" />}
      {children ?? status ?? '—'}
    </span>
  );
}
