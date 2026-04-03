import { API_BASE_URL } from '../config/env';

/**
 * Upload voice samples and create a cloned voice via ElevenLabs.
 *
 * @param {string[]} audioUris - Array of local audio file URIs (m4a).
 * @param {string} userId - Firebase UID of the authenticated user.
 * @param {string} userName - User's display name (used as the voice label in ElevenLabs).
 * @returns {Promise<{ status: string, voice_id: string, message: string }>}
 */
export async function cloneVoice(audioUris, userId, userName = 'User') {
  const formData = new FormData();

  audioUris.forEach((uri, index) => {
    formData.append('files', {
      uri,
      name: `voice_sample_${index}.m4a`,
      type: 'audio/m4a',
    });
  });

  formData.append('user_id', userId);
  formData.append('user_name', userName);

  const response = await fetch(`${API_BASE_URL}/api/voice/clone`, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Voice cloning failed.');
  }

  return response.json();
}

/**
 * Check whether a user has a cloned voice on the server.
 *
 * @param {string} userId - Firebase UID of the authenticated user.
 * @returns {Promise<{ has_cloned_voice: boolean, voice_id: string, is_default: boolean }>}
 */
export async function getVoiceStatus(userId) {
  const response = await fetch(
    `${API_BASE_URL}/api/voice/status?user_id=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    throw new Error('Failed to check voice status.');
  }

  return response.json();
}

/**
 * Delete the user's cloned voice from ElevenLabs and the server.
 *
 * @param {string} userId - Firebase UID of the authenticated user.
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function deleteClonedVoice(userId) {
  const response = await fetch(
    `${API_BASE_URL}/api/voice/clone?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to delete cloned voice.');
  }

  return response.json();
}
