import { Link } from 'react-router-dom';
import { cn } from '../../utils/format';

const TONES = {
  navy: 'bg-navy-50 text-navy-800',
  teal: 'bg-teal-50 text-teal-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  sky: 'bg-sky-50 text-sky-700',
  slate: 'bg-slate-100 text-slate-600',
};

/** KPI tile used on every dashboard. */
export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'navy',
  hint,
  to,
  onClick,
  className,
}) {
  const shell = cn(
    'card card-hover block p-5 text-left',
    (to || onClick) && 'cursor-pointer',
    className
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {Icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              TONES[tone] ?? TONES.navy
            )}
          >
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-navy-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={shell}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}
