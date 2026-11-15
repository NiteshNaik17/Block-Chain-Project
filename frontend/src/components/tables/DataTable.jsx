import { cn } from '../../utils/format';
import EmptyState from '../common/EmptyState';
import { TableSkeleton } from '../common/LoadingSkeleton';

/**
 * Declarative table.
 * columns: [{ key, header, render?(row), align?, headerClassName?, cellClassName? }]
 */
export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  loading = false,
  skeletonRows = 5,
  empty,
  className,
  onRowClick,
  footer,
}) {
  if (loading) {
    return <TableSkeleton rows={skeletonRows} columns={columns.length || 5} />;
  }

  if (!data.length) {
    return <div className="py-2">{empty ?? <EmptyState title="No results" description="Try adjusting your search or filters." />}</div>;
  }

  return (
    <div className={cn('scroll-slim w-full overflow-x-auto', className)}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(column.align === 'right' && 'text-right', column.headerClassName)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row) => (
            <tr
              key={row[keyField]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer')}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(column.align === 'right' && 'text-right', column.cellClassName)}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        {footer && (
          <tfoot>
            <tr>
              <td colSpan={columns.length} className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-muted">
                {footer}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
