import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';

/**
 * Centralised authentication state.
 *
 * The authoritative session lives in an HttpOnly cookie: on start-up the app
 * asks the backend (`GET /auth/me`) who is signed in. The role and account
 * status stored here always come from that response.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initialising, setInitialising] = useState(true);

  // Restore the session on first render (page reload, new tab, ...).
  useEffect(() => {
    let active = true;

    authService
      .fetchCurrentUser()
      .then((current) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setInitialising(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const signedIn = await authService.login(credentials);
    setUser(signedIn);
    return signedIn;
  }, []);

  const registerPatient = useCallback(async (payload) => {
    const created = await authService.registerPatient(payload);
    setUser(created);
    return created;
  }, []);

  const registerDoctor = useCallback(async (payload) => {
    const created = await authService.registerDoctor(payload);
    setUser(created);
    return created;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  /** Re-read the session (e.g. after an administrator verifies this doctor). */
  const refresh = useCallback(async () => {
    const current = await authService.fetchCurrentUser();
    setUser(current);
    return current;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initialising,
      isAuthenticated: Boolean(user),
      login,
      registerPatient,
      registerDoctor,
      logout,
      refresh,
    }),
    [user, initialising, login, registerPatient, registerDoctor, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

export default AuthContext;
