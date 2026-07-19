import { API_BASE_URL } from '../config/env';
import { fetchWithAuth } from '../utils/authHeaders';

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

  const response = await fetchWithAuth(`${API_BASE_URL}/api/voice/clone`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // 422 with error_type='quota' means the ElevenLabs voice slot limit is reached.
    // We mark this as a quota error so callers can show a specific friendly message
    // rather than a generic failure — training can still continue with the default voice.
    if (response.status === 422 && error.detail?.error_type === 'quota') {
      const quotaErr = new Error(error.detail.message || 'Voice profile limit reached.');
      quotaErr.isQuotaError = true;
      throw quotaErr;
    }
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
  const response = await fetchWithAuth(`${API_BASE_URL}/api/voice/status`);

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
  const response = await fetchWithAuth(`${API_BASE_URL}/api/voice/clone`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to delete cloned voice.');
  }

  return response.json();
}
