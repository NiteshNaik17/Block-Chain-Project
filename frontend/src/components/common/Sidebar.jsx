import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react';
import Logo from './Logo';
import Avatar from './Avatar';
import { cn } from '../../utils/format';

/**
 * Dark navy portal sidebar.
 * Desktop: fixed rail that can collapse to icons only.
 * Mobile: off-canvas drawer controlled by `mobileOpen`.
 */
export default function Sidebar({
  items = [],
  user,
  portalLabel,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
  onLogout,
}) {
  const linkBase = 'sidebar-link';

  const renderNav = (compact) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scroll-slim" aria-label={`${portalLabel} navigation`}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={compact ? item.label : undefined}
            className={({ isActive }) =>
              cn(linkBase, isActive && 'sidebar-link-active', compact && 'justify-center px-0')
            }
          >
            {Icon && <Icon size={18} className="shrink-0" aria-hidden="true" />}
            {!compact && <span className="truncate">{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 animate-fade-in bg-navy-950/60 lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-navy-950 transition-transform duration-200 lg:translate-x-0',
          collapsed ? 'lg:w-20' : 'lg:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4">
          <div className="lg:hidden">
            <Logo variant="light" size="sm" />
          </div>

          <div className={cn('hidden w-full lg:flex', collapsed && 'lg:justify-center')}>
            <Logo variant="light" size="sm" showText={!collapsed} />
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="shrink-0 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile summary */}
        <div className={cn('border-b border-white/10 px-4 py-4', collapsed && 'lg:px-2')}>
          <div className={cn('flex items-center gap-3', collapsed && 'lg:justify-center')}>
            <Avatar name={user?.name} src={user?.avatarUrl} size="md" className="ring-2 ring-white/20" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{user?.name}</p>
                <p className="truncate text-xs text-slate-400">{user?.subtitle ?? portalLabel}</p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop rail uses the collapse state; mobile always shows labels */}
        <div className="hidden lg:flex lg:flex-1 lg:flex-col">{renderNav(collapsed)}</div>
        <div className="flex flex-1 flex-col lg:hidden">{renderNav(false)}</div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white',
              collapsed && 'lg:justify-center lg:px-0'
            )}
          >
            <LogOut size={18} aria-hidden="true" />
            {!collapsed && <span>Sign out</span>}
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'mt-1 hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:flex',
              collapsed && 'lg:justify-center lg:px-0'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
