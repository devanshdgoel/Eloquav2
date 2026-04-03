// Update this to your actual backend URL when deploying
const API_BASE_URL = 'http://localhost:8000';

/**
 * Upload voice samples and create a cloned voice via ElevenLabs.
 * @param {string[]} audioUris - Array of local audio file URIs
 * @param {string} userId - User identifier
 * @param {string} userName - User's display name
 */
export async function cloneVoice(audioUris, userId = 'demo_user', userName = 'User') {
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
    throw new Error(error.detail || 'Voice cloning failed');
  }

  return await response.json();
}

/**
 * Check if a user has a cloned voice.
 */
export async function getVoiceStatus(userId = 'demo_user') {
  const response = await fetch(`${API_BASE_URL}/api/voice/status?user_id=${userId}`);

  if (!response.ok) {
    throw new Error('Failed to check voice status');
  }

  return await response.json();
}

/**
 * Delete a user's cloned voice.
 */
export async function deleteClonedVoice(userId = 'demo_user') {
  const response = await fetch(`${API_BASE_URL}/api/voice/clone?user_id=${userId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to delete voice');
  }

  return await response.json();
}
