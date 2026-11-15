import { cn, initials } from '../../utils/format';

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

const PALETTES = [
  'bg-navy-100 text-navy-800',
  'bg-teal-100 text-teal-800',
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
];

function paletteFor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % PALETTES.length;
  return PALETTES[hash];
}

/** Initial-based avatar with optional image. */
export default function Avatar({ name = '', src, size = 'md', className, ring = false }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        SIZES[size] ?? SIZES.md,
        !src && paletteFor(name),
        ring && 'ring-2 ring-white',
        className
      )}
      title={name || undefined}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name) || '—'
      )}
    </span>
  );
}
