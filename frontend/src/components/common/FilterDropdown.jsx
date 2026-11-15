import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../utils/format';

/**
 * Labelled native select used for table filters.
 * options: [{ label, value }] — an "All" entry is added automatically unless
 * `allLabel` is null.
 */
export default function FilterDropdown({
  label,
  value,
  onChange,
  options = [],
  allLabel = 'All',
  className,
  id,
  icon: Icon = SlidersHorizontal,
}) {
  return (
    <div className={cn('relative', className)}>
      {label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}

      {Icon && (
        <Icon
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      )}

      <select
        id={id}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        aria-label={label}
        className={cn(
          'input appearance-none py-2 pr-9 text-sm',
          Icon ? 'pl-9' : 'pl-3',
          value && value !== 'all' && 'border-teal-300 bg-teal-50/40 font-medium text-teal-800'
        )}
      >
        {allLabel && <option value="all">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
    </div>
  );
}
