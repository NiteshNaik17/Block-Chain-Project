import { cn } from '../../utils/format';

/** Bordered white surface with optional header and footer. */
export default function Card({
  title,
  subtitle,
  action,
  footer,
  children,
  className,
  bodyClassName,
  hover = false,
}) {
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <section className={cn('card', hover && 'card-hover', className)}>
      {hasHeader && (
        <header className="card-header">
          <div className="min-w-0">
            {title && <h3 className="truncate text-base font-semibold text-navy-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}

      <div className={cn('card-body', bodyClassName)}>{children}</div>

      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  );
}
