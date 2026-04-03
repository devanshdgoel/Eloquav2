import json
import logging
import os
import requests
from pathlib import Path

logger = logging.getLogger(__name__)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# Local directory for per-user voice profiles (voice_id mapping).
# NOTE: this directory is ephemeral on Railway — profiles are lost on redeploy.
# For production, migrate to Firestore.
VOICE_STORE_PATH = Path("voice_profiles")
VOICE_STORE_PATH.mkdir(exist_ok=True)

# Rachel — ElevenLabs default voice used when no clone exists.
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"


class VoiceCloningError(Exception):
    def __init__(self, message: str, error_type: str = "unknown"):
        self.message = message
        self.error_type = error_type
        super().__init__(message)


def create_cloned_voice(user_id: str, audio_paths: list[Path], user_name: str = "User") -> str:
    """
    Create an ElevenLabs Instant Voice Clone from one or more audio samples.

    ElevenLabs recommends at least 30 seconds of clean audio for best results.
    Supported formats: mp3, wav, m4a. Returns the new voice_id string.
    """
    if not ELEVENLABS_API_KEY:
        raise VoiceCloningError("ElevenLabs API key not configured.", "config")

    if not audio_paths:
        raise VoiceCloningError("No audio samples provided.", "input")

    # Build multipart form: each sample is a separate 'files' field.
    files = []
    for i, path in enumerate(audio_paths):
        if not path.exists():
            logger.warning("Voice sample not found, skipping: %s", path)
            continue
        suffix = path.suffix.lower()
        content_type = {".wav": "audio/wav", ".m4a": "audio/mp4"}.get(suffix, "audio/mpeg")
        files.append(
            ("files", (f"sample_{i}{suffix}", open(path, "rb"), content_type))
        )

    if not files:
        raise VoiceCloningError("No valid audio files found.", "input")

    voice_name = f"Eloqua - {user_name} ({user_id[:8]})"
    data = {
        "name": voice_name,
        "description": f"Cloned voice for Eloqua user {user_id}",
        "remove_background_noise": "true",
    }

    try:
        response = requests.post(
            "https://api.elevenlabs.io/v1/voices/add",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            data=data,
            files=files,
            timeout=60,
        )
    except requests.exceptions.RequestException as exc:
        raise VoiceCloningError(f"Network error: {exc}", "network")
    finally:
        for _, file_tuple in files:
            file_tuple[1].close()

    if response.status_code != 200:
        detail = response.text
        try:
            detail = response.json().get("detail", {}).get("message", response.text)
        except Exception:
            pass
        raise VoiceCloningError(
            f"ElevenLabs error ({response.status_code}): {detail}", "api"
        )

    voice_id = response.json().get("voice_id")
    if not voice_id:
        raise VoiceCloningError("ElevenLabs returned no voice_id.", "api")

    _save_voice_profile(user_id, voice_id, voice_name)
    logger.info("Voice cloned for user %s → voice_id=%s", user_id[:8], voice_id)
    return voice_id


def get_user_voice_id(user_id: str) -> str:
    """Return the user's cloned voice_id, or the default voice if none exists."""
    profile = _load_voice_profile(user_id)
    if profile and profile.get("voice_id"):
        return profile["voice_id"]
    return DEFAULT_VOICE_ID


def has_cloned_voice(user_id: str) -> bool:
    """Return True if a cloned voice profile exists for this user."""
    profile = _load_voice_profile(user_id)
    return profile is not None and "voice_id" in profile


def delete_cloned_voice(user_id: str) -> bool:
    """
    Delete the user's cloned voice from ElevenLabs and remove the local profile.
    Returns False if no profile exists.
    """
    profile = _load_voice_profile(user_id)
    if not profile or "voice_id" not in profile:
        return False

    # Best-effort deletion from ElevenLabs — don't block on failure.
    if ELEVENLABS_API_KEY:
        try:
            requests.delete(
                f"https://api.elevenlabs.io/v1/voices/{profile['voice_id']}",
                headers={"xi-api-key": ELEVENLABS_API_KEY},
                timeout=15,
            )
        except Exception as exc:
            logger.warning("Failed to delete ElevenLabs voice: %s", exc)

    profile_path = VOICE_STORE_PATH / f"{user_id}.json"
    if profile_path.exists():
        profile_path.unlink()

    return True


# ── Private helpers ───────────────────────────────────────────────────────────

def _save_voice_profile(user_id: str, voice_id: str, voice_name: str) -> None:
    profile_path = VOICE_STORE_PATH / f"{user_id}.json"
    with open(profile_path, "w") as f:
        json.dump({"user_id": user_id, "voice_id": voice_id, "voice_name": voice_name}, f, indent=2)


def _load_voice_profile(user_id: str) -> dict | None:
    profile_path = VOICE_STORE_PATH / f"{user_id}.json"
    if not profile_path.exists():
        return None
    try:
        with open(profile_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None
