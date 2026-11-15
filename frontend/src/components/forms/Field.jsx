import { AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/format';

/** Label + control + hint/error wrapper used by every form in the app. */
export default function Field({ label, htmlFor, hint, error, required, children, className, optional }) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden="true">
              *
            </span>
          )}
          {optional && <span className="ml-1 text-xs font-normal text-muted">(optional)</span>}
        </label>
      )}

      {children}

      {error ? (
        <p className="error-text" role="alert">
          <AlertTriangle size={12} aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && <p className="hint">{hint}</p>
      )}
    </div>
  );
}
