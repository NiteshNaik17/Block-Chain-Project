import {
  Activity,
  Clock,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Send,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react';
import PortalShell from '../components/common/PortalShell';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', to: '/patient/dashboard', icon: LayoutDashboard },
  { key: 'records', label: 'Medical Records', to: '/patient/records', icon: FileText },
  { key: 'requests', label: 'Doctor Access Requests', to: '/patient/requests', icon: Send },
  { key: 'consents', label: 'Active Consents', to: '/patient/consents', icon: ShieldCheck },
  { key: 'consent-history', label: 'Consent History', to: '/patient/consent-history', icon: Clock },
  { key: 'access-history', label: 'Access History', to: '/patient/access-history', icon: Activity },
  { key: 'profile', label: 'My Profile', to: '/patient/profile', icon: User },
  { key: 'settings', label: 'Settings', to: '/patient/settings', icon: Settings },
];

/** Patient portal shell — only rendered for an authenticated patient. */
export default function PatientLayout() {
  const { user } = useAuth();

  const shellUser = {
    name: user?.fullName ?? 'Patient',
    email: user?.email ?? '',
    avatarUrl: user?.profilePhoto ?? undefined,
    subtitle: user?.email ?? '',
    roleLabel: roleLabel(user?.role),
  };

  return (
    <PortalShell
      navItems={NAV_ITEMS}
      user={shellUser}
      portalLabel="Patient Portal"
      notificationsApi
      profileLinks={{ profile: '/patient/profile', settings: '/patient/settings' }}
    />
  );
}
