import { LogOut, Menu, Settings, User } from 'lucide-react';
import NotificationDropdown from '../notifications/NotificationDropdown';
import ProfileMenu from './ProfileMenu';
import { cn } from '../../utils/format';

/**
 * Portal top bar: mobile menu trigger, page context, notifications, profile menu.
 * A demo badge makes it explicit that authentication is not active yet.
 */
export default function Topbar({
  onOpenMobileSidebar,
  user,
  portalLabel,
  notifications = [],
  notificationsApi = false,
  notificationsSource,
  onLogout,
  profileLinks = {},
  className,
}) {
  const menuItems = [
    { label: 'My profile', icon: User, to: profileLinks.profile },
    { label: 'Settings', icon: Settings, to: profileLinks.settings },
    { label: 'Sign out', icon: LogOut, tone: 'danger', onClick: onLogout },
  ].filter((item) => item.to || item.onClick);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6',
        className
      )}
    >
      <button
        type="button"
        onClick={onOpenMobileSidebar}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-navy-900">{portalLabel}</p>
        {user?.email && (
          <p className="hidden truncate text-xs text-muted sm:block">{user.email}</p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <NotificationDropdown
          items={notifications}
          source={notificationsSource ?? (notificationsApi ? 'patient' : undefined)}
        />

        <ProfileMenu
          name={user?.name}
          email={user?.email}
          role={user?.roleLabel ?? portalLabel}
          avatarUrl={user?.avatarUrl}
          items={menuItems}
        />
      </div>
    </header>
  );
}
