/**
 * Role helpers shared by the router, the auth context and the portals.
 * These read the role/status values that the BACKEND returned from /auth/me -
 * the frontend never decides its own role.
 */

/** True when an account has been blocked by an administrator. */
export function isBlockedAccount(user) {
  return user?.accountStatus === 'suspended' || user?.accountStatus === 'rejected';
}

/** True only for an administrator-verified, active doctor. */
export function isVerifiedDoctor(user) {
  return (
    user?.role === 'doctor' && user.verificationStatus === 'verified' && user.accountStatus === 'active'
  );
}

/** Landing route for the account's real backend role. */
export function roleHomePath(user) {
  if (!user) return '/login';

  if (user.role === 'admin') return '/admin/dashboard';
  if (user.role === 'doctor') {
    return isVerifiedDoctor(user) ? '/doctor/dashboard' : '/doctor/pending-verification';
  }
  return '/patient/dashboard';
}

/** Display label for a role string. */
export function roleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'doctor') return 'Doctor';
  if (role === 'patient') return 'Patient';
  return 'User';
}

export default { isBlockedAccount, isVerifiedDoctor, roleHomePath, roleLabel };
