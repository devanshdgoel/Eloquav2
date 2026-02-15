import logging
import uuid
import requests
from pathlib import Path

from config import ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID

logger = logging.getLogger(__name__)

AUDIO_OUTPUT_DIR = Path("temp_audio")
AUDIO_OUTPUT_DIR.mkdir(exist_ok=True)


class SpeechEnhancementError(Exception):
    pass


def generate_enhanced_speech(text: str) -> Path:
    """
    Sends text to ElevenLabs and returns path to generated audio file.
    """
    if not ELEVENLABS_API_KEY:
        raise SpeechEnhancementError("ElevenLabs API key not configured")

    if not text or len(text.strip()) < 3:
        raise SpeechEnhancementError("Text too short for speech generation")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    payload = {
        "text": text,
        "voice_settings": {
            "stability": 0.6,
            "similarity_boost": 0.7
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
        logger.error("ElevenLabs network error: %s", e)
        raise SpeechEnhancementError(f"Network error: {str(e)}")

    if response.status_code != 200:
        logger.error("ElevenLabs API error %d: %s", response.status_code, response.text)
        raise SpeechEnhancementError(
            f"ElevenLabs error: {response.status_code} {response.text}"
        )

    filename = f"enhanced_{uuid.uuid4().hex}.mp3"
    output_path = AUDIO_OUTPUT_DIR / filename

    with open(output_path, "wb") as f:
        f.write(response.content)

    return output_path
