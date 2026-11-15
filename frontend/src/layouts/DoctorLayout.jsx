import {
  Activity,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  Send,
  User,
  UserSearch,
} from 'lucide-react';
import PortalShell from '../components/common/PortalShell';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', to: '/doctor/dashboard', icon: LayoutDashboard },
  { key: 'patients', label: 'Patients', to: '/doctor/patients', icon: UserSearch },
  { key: 'request-records', label: 'Request Medical Records', to: '/doctor/request-records', icon: Send },
  { key: 'requests', label: 'My Requests', to: '/doctor/requests', icon: ClipboardList },
  { key: 'accessible-records', label: 'Accessible Records', to: '/doctor/accessible-records', icon: FolderOpen },
  { key: 'access-history', label: 'Access History', to: '/doctor/access-history', icon: Activity },
  { key: 'profile', label: 'My Profile', to: '/doctor/profile', icon: User },
];

/** Doctor portal shell — only rendered for a verified, active doctor. */
export default function DoctorLayout() {
  const { user } = useAuth();

  const shellUser = {
    name: user?.fullName ?? 'Doctor',
    email: user?.email ?? '',
    avatarUrl: user?.profilePhoto ?? undefined,
    subtitle: user?.specialization ? `${user.specialization} · Verified` : 'Verified',
    roleLabel: roleLabel(user?.role),
  };

  return (
    <PortalShell
      navItems={NAV_ITEMS}
      user={shellUser}
      portalLabel="Doctor Portal"
      notificationsSource="doctor"
      profileLinks={{ profile: '/doctor/profile' }}
    />
  );
}
