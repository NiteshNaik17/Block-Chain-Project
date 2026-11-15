import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/format';

/**
 * Prev / next pager for server-paginated tables.
 * `pagination` is the meta object returned by the patient API:
 * { page, limit, total, totalPages, hasMore }.
 */
export default function Pagination({ pagination, onPageChange, itemLabel = 'item', className }) {
  if (!pagination || !pagination.total) return null;

  const { page = 1, limit = 10, total = 0, totalPages = 0 } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <p className="text-xs text-muted">
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span> {itemLabel}
        {total === 1 ? '' : 's'}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          className="btn-outline btn-sm"
          aria-label="Previous page"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Prev
        </button>
        <span className="px-1 text-xs text-muted">
          Page {page} of {totalPages || 1}
        </span>
        <button
          type="button"
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          className="btn-outline btn-sm"
          aria-label="Next page"
        >
          Next
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
