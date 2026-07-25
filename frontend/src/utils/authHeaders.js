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

// Status codes that represent transient backend unavailability worth retrying.
// 502 = Render process restarting (proxy up, app not yet ready).
// 503 = Render free-tier cold start.
// 504 = gateway timeout.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

// Retry delays in milliseconds: 2 s then 4 s.
// Render restarts typically resolve in 2–8 s; this covers most cases
// without making the user wait too long if the backend is genuinely down.
const RETRY_DELAYS = [2000, 4000];

/**
 * fetch() wrapper that:
 *   1. Adds the Firebase auth token automatically.
 *   2. Refreshes the token and retries once on 401 (expired token).
 *   3. Retries up to twice with backoff on 502/503/504 (Render restarts/cold starts).
 *   4. Retries on thrown network errors ("Network request failed") that occur
 *      during the gap between Render killing the old process and the new one
 *      accepting TCP connections.
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
  // A thrown error (e.g. "Network request failed") means no TCP connection —
  // we treat that the same as a transient status and retry below.
  let res = null;
  let lastNetworkError = null;

  try {
    res = await attempt();
  } catch (e) {
    lastNetworkError = e;
  }

  // Handle 401 (expired token) by force-refreshing and retrying once.
  if (res && res.status === 401) {
    try {
      res = await attempt(true);
      lastNetworkError = null;
    } catch (e) {
      lastNetworkError = e;
      res = null;
    }
  }

  // Retry on transient HTTP errors or on a thrown network error.
  // Re-check 401 after each retry in case the token expired mid-backoff.
  for (const delay of RETRY_DELAYS) {
    const shouldRetry = res === null || TRANSIENT_STATUSES.has(res.status);
    if (!shouldRetry) break;
    await sleep(delay);
    try {
      res = await attempt();
      lastNetworkError = null;
    } catch (e) {
      lastNetworkError = e;
      res = null;
    }
    if (res && res.status === 401) {
      try {
        res = await attempt(true);
        lastNetworkError = null;
      } catch (e) {
        lastNetworkError = e;
        res = null;
      }
    }
  }

  // All retries exhausted with no response — rethrow so callers can surface
  // an appropriate "no connection" message.
  if (res === null) throw lastNetworkError;
  return res;
}
