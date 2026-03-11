import logging
import requests

from config import OPENAI_API_KEY

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    def __init__(self, error_type: str, message: str):
        self.error_type = error_type
        self.message = message
        super().__init__(message)


def transcribe_audio(audio_path: str) -> tuple:
    """
    Returns (text: str, duration_seconds: float).
    Uses verbose_json so we get audio duration for speaking-rate analysis.
    """
    if not OPENAI_API_KEY:
        raise TranscriptionError(
            error_type="internal",
            message="OpenAI API key not configured"
        )

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}"
    }

    files = {
        "file": open(audio_path, "rb"),
        "model": (None, "whisper-1"),
        "response_format": (None, "verbose_json"),
    }

    try:
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers=headers,
            files=files,
            timeout=30
        )
    except requests.exceptions.RequestException as e:
        logger.error("Transcription network error: %s", e)
        raise TranscriptionError(
            error_type="network",
            message=f"Network error during transcription: {str(e)}"
        )

    if response.status_code == 429:
        logger.warning("OpenAI quota exceeded")
        raise TranscriptionError(
            error_type="quota",
            message="Speech transcription quota exceeded"
        )

    if response.status_code != 200:
        logger.error("Whisper API error %d: %s", response.status_code, response.text)
        raise TranscriptionError(
            error_type="internal",
            message=f"Whisper error: {response.text}"
        )

    data = response.json()
    text = data.get("text", "").strip()
    duration = float(data.get("duration", 0.0))

    if not text:
        raise TranscriptionError(
            error_type="empty",
            message="No clear speech detected in the audio."
        )

    return text, duration
