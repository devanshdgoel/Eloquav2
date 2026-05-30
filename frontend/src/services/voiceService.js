import { API_BASE_URL } from '../config/env';
import { getAuthHeaders } from '../utils/authHeaders';

/**
 * Upload voice samples and create a cloned voice via ElevenLabs.
 *
 * @param {string[]} audioUris - Array of local audio file URIs (m4a).
 * @param {string} userName - User's display name (used as the voice label in ElevenLabs).
 * @returns {Promise<{ status: string, voice_id: string, message: string }>}
 */
export async function cloneVoice(audioUris, userName = 'User') {
  const formData = new FormData();

  audioUris.forEach((uri, index) => {
    formData.append('files', {
      uri,
      name: `voice_sample_${index}.m4a`,
      type: 'audio/m4a',
    });
  });

  formData.append('user_name', userName);

  const authHeaders = await getAuthHeaders();
  // Do NOT set Content-Type manually — fetch auto-sets multipart/form-data
  // with the correct boundary when the body is FormData.
  const response = await fetch(`${API_BASE_URL}/api/voice/clone`, {
    method: 'POST',
    headers: authHeaders,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Voice cloning failed.');
  }

  return response.json();
}

/**
 * Check whether the authenticated user has a cloned voice on the server.
 *
 * @returns {Promise<{ has_cloned_voice: boolean, voice_id: string, is_default: boolean }>}
 */
export async function getVoiceStatus() {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/voice/status`, {
    headers: authHeaders,
  });

  if (!response.ok) {
    throw new Error('Failed to check voice status.');
  }

  return response.json();
}

/**
 * Delete the authenticated user's cloned voice from ElevenLabs and the server.
 *
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function deleteClonedVoice() {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/api/voice/clone`, {
    method: 'DELETE',
    headers: authHeaders,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to delete cloned voice.');
  }

  return response.json();
}
