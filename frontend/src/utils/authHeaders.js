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

// Delay used for exponential backoff.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Status codes that represent transient backend unavailability.
// 503 = Render free-tier cold start; 504 = gateway timeout.
// These are the only codes where a short retry is likely to succeed.
const TRANSIENT_STATUSES = new Set([503, 504]);

// Retry delays in milliseconds: 1 s then 2 s.
// Two retries cover most Render cold-start scenarios (typically < 2 s).
const RETRY_DELAYS = [1000, 2000];

/**
 * fetch() wrapper that:
 *   1. Adds the Firebase auth token automatically.
 *   2. Refreshes the token and retries once on 401 (expired token).
 *   3. Retries up to twice with exponential backoff on 503/504 (Render cold starts).
 *
 * Use this instead of raw fetch() for all API calls so that token expiry
 * and transient backend unavailability are handled transparently.
 *
 * @param {string} url
 * @param {RequestInit} options - Do NOT include Authorization here; it's added automatically.
 * @returns {Promise<Response>}
 */
export async function fetchWithAuth(url, options = {}) {
  // Helper: attach the current (or force-refreshed) auth token and run the fetch.
  async function attempt(forceRefresh = false) {
    const authH = await getAuthHeaders(forceRefresh);
    const merged = { ...(options.headers ?? {}), ...authH };
    return fetch(url, { ...options, headers: merged });
  }

  // First attempt with the cached token.
  let res = await attempt();

  // Handle 401 (expired token) by force-refreshing and retrying once.
  if (res.status === 401) {
    res = await attempt(true);
  }

  // Retry transient 5xx errors with backoff so Render cold starts are invisible.
  // We re-check 401 after each retry in case the refresh expired mid-backoff.
  for (const delay of RETRY_DELAYS) {
    if (!TRANSIENT_STATUSES.has(res.status)) break;
    await sleep(delay);
    res = await attempt();
    if (res.status === 401) res = await attempt(true);
  }

  return res;
}
