import os
import json
import requests
from pathlib import Path

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_STORE_PATH = Path("voice_profiles")
VOICE_STORE_PATH.mkdir(exist_ok=True)

# Default fallback voice
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"


class VoiceCloningError(Exception):
    def __init__(self, message, error_type="unknown"):
        self.message = message
        self.error_type = error_type
        super().__init__(message)


def create_cloned_voice(user_id: str, audio_paths: list[Path], user_name: str = "User") -> str:
    """
    Creates an Instant Voice Clone on ElevenLabs from audio samples.
    Returns the new voice_id.

    ElevenLabs Instant Voice Cloning:
    - Minimum ~30 seconds of audio recommended
    - Supports mp3, wav, m4a
    - Creates voice in seconds
    - No approval needed (unlike Professional Voice Clone)
    """
    if not ELEVENLABS_API_KEY:
        raise VoiceCloningError("ElevenLabs API key not configured", "config")

    if not audio_paths:
        raise VoiceCloningError("No audio samples provided", "input")

    url = "https://api.elevenlabs.io/v1/voices/add"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
    }

    # Build multipart form data
    files = []
    for i, path in enumerate(audio_paths):
        if not path.exists():
            continue
        content_type = "audio/mpeg"
        if str(path).endswith(".wav"):
            content_type = "audio/wav"
        elif str(path).endswith(".m4a"):
            content_type = "audio/mp4"
        files.append(("files", (f"sample_{i}{path.suffix}", open(path, "rb"), content_type)))

    if not files:
        raise VoiceCloningError("No valid audio files found", "input")

    voice_name = f"Eloqua - {user_name} ({user_id[:8]})"

    data = {
        "name": voice_name,
        "description": f"Cloned voice for Eloqua user {user_id}",
        "remove_background_noise": "true",
    }

    try:
        response = requests.post(url, headers=headers, data=data, files=files, timeout=60)
    except requests.exceptions.RequestException as e:
        raise VoiceCloningError(f"Network error: {str(e)}", "network")
    finally:
        for _, file_tuple in files:
            file_tuple[1].close()

    if response.status_code != 200:
        error_detail = response.text
        try:
            error_json = response.json()
            error_detail = error_json.get("detail", {}).get("message", response.text)
        except Exception:
            pass
        raise VoiceCloningError(
            f"ElevenLabs error ({response.status_code}): {error_detail}", "api"
        )

    result = response.json()
    voice_id = result.get("voice_id")

    if not voice_id:
        raise VoiceCloningError("No voice_id returned from ElevenLabs", "api")

    # Save voice profile locally
    _save_voice_profile(user_id, voice_id, voice_name)

    return voice_id


def get_user_voice_id(user_id: str) -> str:
    """
    Returns the user's cloned voice_id, or the default voice if none exists.
    """
    profile = _load_voice_profile(user_id)
    if profile and profile.get("voice_id"):
        return profile["voice_id"]
    return DEFAULT_VOICE_ID


def has_cloned_voice(user_id: str) -> bool:
    """Check if a user has a cloned voice."""
    profile = _load_voice_profile(user_id)
    return profile is not None and "voice_id" in profile


def delete_cloned_voice(user_id: str) -> bool:
    """Delete a user's cloned voice from ElevenLabs and local storage."""
    profile = _load_voice_profile(user_id)
    if not profile or "voice_id" not in profile:
        return False

    voice_id = profile["voice_id"]

    # Delete from ElevenLabs
    if ELEVENLABS_API_KEY:
        try:
            url = f"https://api.elevenlabs.io/v1/voices/{voice_id}"
            headers = {"xi-api-key": ELEVENLABS_API_KEY}
            requests.delete(url, headers=headers, timeout=15)
        except Exception:
            pass  # Best effort — still remove local profile

    # Remove local profile
    profile_path = VOICE_STORE_PATH / f"{user_id}.json"
    if profile_path.exists():
        profile_path.unlink()

    return True


def _save_voice_profile(user_id: str, voice_id: str, voice_name: str):
    profile_path = VOICE_STORE_PATH / f"{user_id}.json"
    profile = {
        "user_id": user_id,
        "voice_id": voice_id,
        "voice_name": voice_name,
    }
    with open(profile_path, "w") as f:
        json.dump(profile, f, indent=2)


def _load_voice_profile(user_id: str) -> dict | None:
    profile_path = VOICE_STORE_PATH / f"{user_id}.json"
    if not profile_path.exists():
        return None
    try:
        with open(profile_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None
