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


def generate_enhanced_speech(
    text: str,
    voice_id: str | None = None,
    voice_settings: dict | None = None,
) -> Path:
    """
    Sends text to ElevenLabs and returns path to the generated audio file.

    voice_id        — ElevenLabs voice ID; falls back to config default.
    voice_settings  — dict with stability, similarity_boost, style, speed.
                      Falls back to sensible defaults.
    """
    if not ELEVENLABS_API_KEY:
        raise SpeechEnhancementError("ElevenLabs API key not configured")

    if not text or len(text.strip()) < 3:
        raise SpeechEnhancementError("Text too short for speech generation")

    used_voice_id = voice_id or ELEVENLABS_VOICE_ID
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{used_voice_id}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    settings = {
        "stability": 0.50,
        "similarity_boost": 0.75,
        "style": 0.30,
        "speed": 1.0,
    }
    if voice_settings:
        settings.update(voice_settings)

    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": settings,
    }

    logger.info(
        "ElevenLabs TTS → voice=%s speed=%.2f stability=%.2f style=%.2f",
        used_voice_id, settings["speed"], settings["stability"], settings.get("style", 0),
    )

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
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
