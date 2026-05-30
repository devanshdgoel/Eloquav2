import { auth } from '../config/firebase';

/**
 * Returns an Authorization header object with the current user's Firebase ID token.
 * Returns an empty object for unauthenticated/guest callers — routes that require
 * auth will return 401, routes that don't will proceed normally.
 */
export async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
