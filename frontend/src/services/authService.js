import api, { unwrap } from './api';

/**
 * Authentication API client.
 * Every call relies on the HttpOnly session cookie - no token is ever stored
 * or returned to application code.
 */

/** POST /v1/auth/register/patient */
export async function registerPatient(payload) {
  const response = await api.post('/v1/auth/register/patient', payload);
  return unwrap(response).user;
}

/** POST /v1/auth/register/doctor */
export async function registerDoctor(payload) {
  const response = await api.post('/v1/auth/register/doctor', payload);
  return unwrap(response).user;
}

/** POST /v1/auth/login */
export async function login({ email, password }) {
  const response = await api.post('/v1/auth/login', { email, password });
  return unwrap(response).user;
}

/** POST /v1/auth/logout */
export async function logout() {
  const response = await api.post('/v1/auth/logout');
  return unwrap(response);
}

/** GET /v1/auth/me - returns null when there is no valid session. */
export async function fetchCurrentUser() {
  try {
    const response = await api.get('/v1/auth/me');
    return unwrap(response).user;
  } catch (error) {
    if (error?.response?.status === 401) return null;
    throw error;
  }
}

export default { registerPatient, registerDoctor, login, logout, fetchCurrentUser };
