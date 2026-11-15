import { cloneElement, useCallback, useRef, useState } from 'react';
import useClickOutside from '../../hooks/useClickOutside';
import { cn } from '../../utils/format';

const ALIGN = {
  right: 'right-0',
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
};

/**
 * Small popup panel anchored to a trigger element.
 * The trigger must be a single element that accepts onClick / aria-expanded.
 */
export default function Dropdown({
  trigger,
  children,
  align = 'right',
  panelClassName,
  width = 'w-80',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close, open);

  const triggerNode = cloneElement(trigger, {
    onClick: (event) => {
      trigger.props?.onClick?.(event);
      setOpen((previous) => !previous);
    },
    'aria-expanded': open,
    'aria-haspopup': 'true',
  });

  return (
    <div className="relative" ref={containerRef}>
      {triggerNode}

      {open && (
        <div
          className={cn(
            'absolute top-[calc(100%+0.5rem)] z-40 animate-scale-in rounded-xl2 border border-slate-200 bg-white shadow-pop',
            ALIGN[align] ?? ALIGN.right,
            width,
            panelClassName
          )}
          role="menu"
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
