import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import Dropdown from './Dropdown';
import Avatar from './Avatar';
import { cn } from '../../utils/format';

/**
 * Avatar + name trigger with a menu of links / actions.
 * items: [{ label, to?, onClick?, icon?, tone?: 'danger' }]
 */
export default function ProfileMenu({ name, email, role, avatarUrl, items = [], compact = false }) {
  return (
    <Dropdown
      width="w-64"
      panelClassName="overflow-hidden p-0"
      trigger={
        <button
          type="button"
          className={cn(
            'flex items-center gap-2.5 rounded-lg p-1.5 pr-2 transition-colors hover:bg-slate-100',
            compact && 'pr-1.5'
          )}
          aria-label="Open profile menu"
        >
          <Avatar name={name} src={avatarUrl} size="sm" />
          {!compact && (
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block truncate text-sm font-medium text-navy-900">{name}</span>
              <span className="block truncate text-xs text-muted">{role}</span>
            </span>
          )}
          <ChevronDown size={15} className="hidden shrink-0 text-slate-400 sm:block" />
        </button>
      }
    >
      {({ close }) => (
        <>
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <Avatar name={name} src={avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy-900">{name}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
          </div>

          <ul className="py-1">
            {items.map((item) => {
              const Icon = item.icon;
              const classes = cn(
                'flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                item.tone === 'danger'
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-slate-700 hover:bg-slate-50'
              );

              return (
                <li key={item.label}>
                  {item.to ? (
                    <Link to={item.to} className={classes} onClick={close}>
                      {Icon && <Icon size={16} aria-hidden="true" />}
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={classes}
                      onClick={() => {
                        item.onClick?.();
                        close();
                      }}
                    >
                      {Icon && <Icon size={16} aria-hidden="true" />}
                      {item.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Dropdown>
  );
}
