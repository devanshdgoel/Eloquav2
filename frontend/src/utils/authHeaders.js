import { auth } from '../config/firebase';

/**
 * Returns an Authorization header object with the current user's Firebase ID token.
 * Returns an empty object for unauthenticated/guest callers — routes that require
 * auth will return 401, routes that don't will proceed normally.
 */
export async function getAuthHeaders(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken(forceRefresh);
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

/**
 * fetch() wrapper that automatically retries once with a force-refreshed token on 401.
 * Use this instead of raw fetch() for all authenticated API calls to avoid surfacing
 * token-expiry errors to Parkinson's patients.
 *
 * @param {string} url
 * @param {RequestInit} options - Do NOT include Authorization here; it's added automatically.
 * @returns {Promise<Response>}
 */
export async function fetchWithAuth(url, options = {}) {
  const headers = { ...(options.headers ?? {}), ...(await getAuthHeaders()) };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const freshHeaders = { ...(options.headers ?? {}), ...(await getAuthHeaders(true)) };
    return fetch(url, { ...options, headers: freshHeaders });
  }
  return res;
}
