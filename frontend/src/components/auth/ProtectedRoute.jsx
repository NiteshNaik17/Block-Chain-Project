import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import Button from '../common/Button';
import Logo from '../common/Logo';
import { useAuth } from '../../context/AuthContext';
import { isBlockedAccount, roleHomePath } from '../../utils/roles';

/** Full-page state shown while the session is being restored from the backend. */
function SessionLoader({ label = 'Checking your session…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6">
      <Logo size="md" />
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600"
        aria-hidden="true"
      />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

/** Shown when an administrator has suspended or rejected the account. */
function BlockedAccountScreen({ user }) {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6">
      <div className="w-full max-w-md rounded-xl2 border border-red-200 bg-white p-6 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-navy-900">Account access restricted</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {user?.accountStatus === 'suspended'
            ? 'This account has been suspended. Please contact MediConsent support before signing in again.'
            : 'This account application was rejected and no longer has access to the portal.'}
        </p>
        <Button
          variant="outline"
          className="mt-6"
          icon={LogOut}
          onClick={() => {
            logout().finally(() => window.location.assign('/login'));
          }}
        >
          Back to sign in
        </Button>
      </div>
    </div>
  );
}

/**
 * Route guard.
 *
 * `allow`              - the role the backend must have reported for this area.
 * `requireVerifiedDoctor` - also demand `verified` + `active` (patient records).
 *
 * The role is never taken from a query string, local storage or the demo
 * selector - it comes from the `/auth/me` response.
 */
export default function ProtectedRoute({ allow, requireVerifiedDoctor = false, children }) {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <SessionLoader />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isBlockedAccount(user)) return <BlockedAccountScreen user={user} />;

  if (allow && user.role !== allow) {
    return <Navigate to={roleHomePath(user)} replace />;
  }

  if (requireVerifiedDoctor && (user.verificationStatus !== 'verified' || user.accountStatus !== 'active')) {
    return <Navigate to="/doctor/pending-verification" replace />;
  }

  return children ?? <Outlet />;
}

/** Sign-in / registration pages: signed-in visitors are sent to their own portal. */
export function GuestRoute({ children }) {
  const { user, initialising } = useAuth();

  if (initialising) return <SessionLoader />;
  if (user) {
    if (isBlockedAccount(user)) return <BlockedAccountScreen user={user} />;
    return <Navigate to={roleHomePath(user)} replace />;
  }

  return children ?? <Outlet />;
}
