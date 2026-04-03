import os
import uuid
import requests
from pathlib import Path

from services.voice_cloning_service import get_user_voice_id, DEFAULT_VOICE_ID

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

AUDIO_OUTPUT_DIR = Path("temp_audio")
AUDIO_OUTPUT_DIR.mkdir(exist_ok=True)


class SpeechEnhancementError(Exception):
    pass


def generate_enhanced_speech(text: str, user_id: str = None) -> Path:
    """
    Sends text to ElevenLabs and returns path to generated audio file.
    If user_id is provided and has a cloned voice, uses their voice.
    Otherwise falls back to default voice.
    """
    if not ELEVENLABS_API_KEY:
        raise SpeechEnhancementError("ElevenLabs API key not configured")

    if not text or len(text.strip()) < 3:
        raise SpeechEnhancementError("Text too short for speech generation")

    # Use user's cloned voice if available, otherwise default
    if user_id:
        voice_id = get_user_voice_id(user_id)
    else:
        voice_id = DEFAULT_VOICE_ID

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    payload = {
        "text": text,
        "model_id": "eleven_v3",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.85,
        }
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=30
        )
    except requests.exceptions.RequestException as e:
        raise SpeechEnhancementError(f"Network error: {str(e)}")

    if response.status_code != 200:
        raise SpeechEnhancementError(
            f"ElevenLabs error: {response.status_code} {response.text}"
        )

    filename = f"enhanced_{uuid.uuid4().hex}.mp3"
    output_path = AUDIO_OUTPUT_DIR / filename

    with open(output_path, "wb") as f:
        f.write(response.content)

    return output_path
