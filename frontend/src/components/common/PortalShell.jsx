import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/format';

/**
 * Shared shell for the Patient, Doctor and Admin portals:
 * sidebar + top bar + routed content area.
 */
export default function PortalShell({
  navItems = [],
  user,
  portalLabel,
  notifications = [],
  notificationsApi = false,
  notificationsSource,
  profileLinks = {},
  contentClassName,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setMobileOpen(false);
    try {
      await logout();
      toast.success('Signed out successfully.');
    } catch {
      toast.error('Signed out on this device, but the server could not be reached.');
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar
        items={navItems}
        user={user}
        portalLabel={portalLabel}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((previous) => !previous)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-20' : 'lg:pl-64')}>
        <Topbar
          onOpenMobileSidebar={() => setMobileOpen(true)}
          user={user}
          portalLabel={portalLabel}
          notifications={notifications}
          notificationsApi={notificationsApi}
          notificationsSource={notificationsSource}
          onLogout={handleLogout}
          profileLinks={profileLinks}
        />

        <main className={cn('flex-1 px-4 py-6 sm:px-6 lg:px-8', contentClassName)}>
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-muted sm:px-6 lg:px-8">
          MediConsent · Your medical records. Your control.
        </footer>
      </div>
    </div>
  );
}
