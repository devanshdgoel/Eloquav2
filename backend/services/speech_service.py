import logging
import requests

from config import OPENAI_API_KEY

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    def __init__(self, error_type: str, message: str):
        self.error_type = error_type
        self.message = message
        super().__init__(message)


def transcribe_audio(audio_path: str, prompt: str = "") -> tuple:
    """
    Returns (text: str, duration_seconds: float).
    Uses verbose_json so we get audio duration for speaking-rate analysis.

    prompt: optional previous transcript text passed to Whisper for context
    continuity across chunks — greatly improves accuracy at chunk boundaries.
    Whisper's prompt window is ~224 tokens; we send the last 800 chars.
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
        # Locking to English prevents Whisper's language auto-detect from
        # misidentifying dysarthric speech as a different language — a real
        # failure mode for slurred or low-volume utterances.
        "language": (None, "en"),
    }

    if prompt:
        # Pass the last 800 chars of previous transcript as context.
        # Whisper uses this as an "initial prompt" to carry vocabulary and
        # style across chunk boundaries, reducing word-boundary errors.
        files["prompt"] = (None, prompt[-800:])

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
    segments = data.get("segments", [])

    if not text:
        raise TranscriptionError(
            error_type="empty",
            message="No clear speech detected in the audio."
        )

    # Use Whisper's own confidence signals to reject non-speech audio.
    # verbose_json exposes no_speech_prob and avg_logprob per segment —
    # these are far more reliable than content-based filters for silence/noise.
    if segments:
        n = len(segments)
        mean_no_speech = sum(s.get("no_speech_prob", 0.0) for s in segments) / n
        mean_logprob   = sum(s.get("avg_logprob",    0.0) for s in segments) / n

        # High no-speech probability: Whisper is confident there's no speech
        if mean_no_speech > 0.70:
            logger.info(
                "Whisper no_speech_prob=%.2f — rejecting as silence/noise", mean_no_speech
            )
            raise TranscriptionError(
                error_type="empty",
                message="No clear speech detected in the audio."
            )

        # Moderate no-speech AND very low log-probability: low-quality or ambiguous audio
        if mean_no_speech > 0.40 and mean_logprob < -0.85:
            logger.info(
                "Whisper no_speech_prob=%.2f logprob=%.2f — rejecting low-quality audio",
                mean_no_speech, mean_logprob
            )
            raise TranscriptionError(
                error_type="empty",
                message="Audio quality too low to transcribe reliably."
            )

    return text, duration
