import { cn } from '../../utils/format';

/** Base shimmer block. */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/80', className)} />;
}

/** Placeholder rows for a table that is still loading. */
export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <div className="table-wrapper" aria-hidden="true">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, index) => (
              <th key={index}>
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((__, colIndex) => (
                <td key={colIndex}>
                  <Skeleton className={cn('h-4', colIndex === 0 ? 'w-40' : 'w-24')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Placeholder grid for dashboard KPI tiles. */
export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <Skeleton className="mt-4 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
