import { Activity, BadgeCheck, LayoutDashboard, Users, UserSearch } from 'lucide-react';
import PortalShell from '../components/common/PortalShell';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
  { key: 'patients', label: 'Manage Patients', to: '/admin/patients', icon: UserSearch },
  { key: 'verify-doctors', label: 'Verify Doctors', to: '/admin/verify-doctors', icon: BadgeCheck },
  { key: 'users', label: 'Manage Users', to: '/admin/users', icon: Users },
  { key: 'activity-logs', label: 'System Activity Logs', to: '/admin/activity-logs', icon: Activity },
];

/** Administrator portal shell — only rendered for an authenticated admin. */
export default function AdminLayout() {
  const { user } = useAuth();

  const shellUser = {
    name: user?.fullName ?? 'Administrator',
    email: user?.email ?? '',
    avatarUrl: user?.profilePhoto ?? undefined,
    subtitle: user?.email ?? '',
    roleLabel: roleLabel(user?.role),
  };

  return (
    <PortalShell
      navItems={NAV_ITEMS}
      user={shellUser}
      portalLabel="Admin Portal"
      notificationsSource="admin"
      profileLinks={{}}
    />
  );
}
