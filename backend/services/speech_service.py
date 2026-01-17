import os
import requests


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


class TranscriptionError(Exception):
    def __init__(self, error_type: str, message: str):
        self.error_type = error_type
        self.message = message
        super().__init__(message)


def transcribe_audio(audio_path: str) -> str:
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
        "model": (None, "whisper-1")
    }

    try:
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers=headers,
            files=files,
            timeout=30
        )
    except requests.exceptions.RequestException as e:
        raise TranscriptionError(
            error_type="network",
            message=f"Network error during transcription: {str(e)}"
        )

    if response.status_code == 429:
        raise TranscriptionError(
            error_type="quota",
            message="Speech transcription quota exceeded"
        )

    if response.status_code != 200:
        raise TranscriptionError(
            error_type="internal",
            message=f"Whisper error: {response.text}"
        )

    text = response.json().get("text", "").strip()

    if not text:
        raise TranscriptionError(
            error_type="empty",
            message="No clear speech detected in the audio."
        )

    return text
