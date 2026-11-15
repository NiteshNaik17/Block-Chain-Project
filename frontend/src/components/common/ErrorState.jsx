import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';
import { cn } from '../../utils/format';

/** Consistent failure panel with an optional retry action. */
export default function ErrorState({
  title = 'We could not load this page',
  message,
  onRetry,
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-6 py-12 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle size={22} aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
        {message && <p className="mt-1 max-w-md text-sm text-muted">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="primary" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
