/**
 * Shared formatting helpers.
 * Kept free of React so they can be reused by any layer.
 */

/** Join conditional class names: cn('a', cond && 'b'). */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Mar 2026" */
export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "12 Mar 2026, 14:35" */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** "14:35" */
export function formatTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "3 days ago" / "in 6 days" for relative recency. */
export function formatRelative(value) {
  const date = toDate(value);
  if (!date) return '—';
  const diffMs = date.getTime() - Date.now();
  const absDays = Math.round(Math.abs(diffMs) / 86400000);
  const suffix = diffMs < 0 ? 'ago' : 'remaining';

  if (absDays === 0) return 'today';
  if (absDays === 1) return diffMs < 0 ? 'yesterday' : 'tomorrow';
  if (absDays < 30) return `${absDays} days ${suffix}`;

  const months = Math.round(absDays / 30);
  return `${months} month${months > 1 ? 's' : ''} ${suffix}`;
}

/** Remaining days until an ISO timestamp (negative when already expired). */
export function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

/** "AS" from "Ananya Sharma". */
export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** 486000 -> "475 KB" */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** index;
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

/** "0x1234…abcd" — used for wallet addresses and future tx references. */
export function shortAddress(value, lead = 6, tail = 4) {
  if (!value) return '—';
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** Number with thousands separators. */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US');
}
