import { saveToken, removeToken } from '../utils/storage';

// Update this to your Render deployment URL
const API_BASE_URL = 'http://localhost:8000';

/**
 * Send Firebase/Google ID token to backend, receive internal JWT
 */
export async function authenticateWithGoogle(idToken) {
  const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Authentication failed');
  }

  const data = await response.json();
  await saveToken(data.access_token);
  return data;
}

/**
 * Send user profile data to backend after onboarding
 */
export async function submitUserProfile(token, profileData) {
  const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(profileData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to save profile');
  }

  return await response.json();
}

/**
 * Sign out - clear stored token
 */
export async function signOut() {
  await removeToken();
}
