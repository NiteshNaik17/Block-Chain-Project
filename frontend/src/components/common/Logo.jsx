import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { cn } from '../../utils/format';

const SIZES = {
  sm: { box: 'h-8 w-8 rounded-lg', icon: 16, text: 'text-base' },
  md: { box: 'h-9 w-9 rounded-lg', icon: 18, text: 'text-lg' },
  lg: { box: 'h-11 w-11 rounded-xl', icon: 22, text: 'text-xl' },
};

/**
 * MediConsent wordmark.
 * variant="light" is used on dark navy surfaces (sidebar, footer, auth panel).
 */
export default function Logo({
  to = '/',
  size = 'md',
  variant = 'dark',
  showText = true,
  className,
}) {
  const s = SIZES[size] ?? SIZES.md;

  const content = (
    <>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center',
          s.box,
          variant === 'light' ? 'bg-teal-500 text-white' : 'bg-navy-900 text-white'
        )}
      >
        <ShieldCheck size={s.icon} strokeWidth={2.2} />
      </span>
      {showText && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-semibold tracking-tight',
              s.text,
              variant === 'light' ? 'text-white' : 'text-navy-900'
            )}
          >
            Medi<span className="text-teal-600">Consent</span>
          </span>
          <span
            className={cn(
              'mt-0.5 text-[10px] font-medium uppercase tracking-widest',
              variant === 'light' ? 'text-slate-300' : 'text-muted'
            )}
          >
            Your Records. Your Control.
          </span>
        </span>
      )}
    </>
  );

  if (!to) {
    return <span className={cn('inline-flex items-center gap-2.5', className)}>{content}</span>;
  }

  return (
    <Link
      to={to}
      className={cn('inline-flex items-center gap-2.5', className)}
      aria-label="MediConsent home"
    >
      {content}
    </Link>
  );
}
