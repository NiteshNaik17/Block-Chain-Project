import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/format';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

const ICON_TONES = {
  navy: 'bg-navy-50 text-navy-800',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  emerald: 'bg-emerald-50 text-emerald-700',
};

/**
 * Accessible dialog. Locks scroll, closes on Escape, and is responsive
 * (bottom sheet on small screens, centred card from `sm` upwards).
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  iconTone = 'navy',
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : 'Dialog'}
    >
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 h-full w-full cursor-default animate-fade-in bg-navy-950/50 backdrop-blur-[2px]"
      />

      <div
        className={cn(
          'relative z-10 flex max-h-[92vh] w-full animate-slide-up flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-xl2',
          SIZES[size] ?? SIZES.md
        )}
      >
        {(title || Icon) && (
          <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
            {Icon && (
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  ICON_TONES[iconTone] ?? ICON_TONES.navy
                )}
              >
                <Icon size={18} aria-hidden="true" />
              </span>
            )}

            <div className="min-w-0 flex-1">
              {title && <h2 className="text-base font-semibold text-navy-900">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>
        )}

        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
