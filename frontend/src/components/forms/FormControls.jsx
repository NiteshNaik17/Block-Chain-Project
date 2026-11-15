import { cn } from '../../utils/format';

/**
 * Thin wrappers around the native form controls so styling stays consistent.
 * All of them accept an `error` flag and forward the remaining props.
 */

export function Input({ className, error, icon: Icon, ...rest }) {
  if (!Icon) {
    return <input className={cn('input', error && 'input-error', className)} {...rest} />;
  }

  return (
    <div className="relative">
      <Icon
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input className={cn('input pl-9', error && 'input-error', className)} {...rest} />
    </div>
  );
}

export function Select({ className, error, options = [], placeholder, children, ...rest }) {
  return (
    <select className={cn('input', error && 'input-error', className)} {...rest}>
      {placeholder && (
        <option value="" disabled={rest.required}>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
}

export function Textarea({ className, error, rows = 4, ...rest }) {
  return (
    <textarea rows={rows} className={cn('input resize-y', error && 'input-error', className)} {...rest} />
  );
}

export function Checkbox({ id, label, description, className, ...rest }) {
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        {...rest}
      />
      {(label || description) && (
        <span className="text-sm leading-snug">
          {label && <span className="font-medium text-slate-700">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Toggle({ id, checked, onChange, label, description, disabled = false }) {
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <span className="text-sm">
          {label && (
            <label htmlFor={id} className="font-medium text-slate-700">
              {label}
            </label>
          )}
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </span>
      )}

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150',
          checked ? 'bg-teal-600' : 'bg-slate-300',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <span
          className={cn(
            'inline-block transform rounded-full bg-white shadow transition-transform duration-150',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </div>
  );
}
