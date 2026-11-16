import axios from 'axios';

/**
 * Single Axios instance for the MediConsent API.
 *
 * `withCredentials` is required so the browser sends and stores the HttpOnly
 * session cookie. The JWT itself is never readable from JavaScript and is never
 * written to localStorage or sessionStorage.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(
  /\/+$/,
  ''
);

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

/** Unwrap the standard `{ success, message, user|data, errors }` envelope. */
export function unwrap(response) {
  return response.data;
}

/** Turn the API's `errors: [{ field, message }]` array into a `{ field: message }` map. */
export function fieldErrorsFrom(error) {
  const errors = error?.response?.data?.errors;
  if (!Array.isArray(errors)) return {};

  const map = {};
  for (const issue of errors) {
    if (!issue?.field) continue;
    if (!map[issue.field]) map[issue.field] = issue.message || 'Invalid value';
  }
  return map;
}

/** Human-readable message for any Axios failure, safe to show in a toast. */
export function apiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  if (data?.message) return data.message;
  if (error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the MediConsent API. Please make sure the backend is running.';
  }
  return fallback;
}

export default api;
