import logging
import requests
from firebase_admin import firestore

from config import ELEVENLABS_API_KEY

logger = logging.getLogger(__name__)

# Rachel — ElevenLabs default voice used when no clone exists.
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

# Firestore collection that holds per-user profiles.
# voice_id is stored as a field on the same document as name/email/age/phone.
_USERS_COLLECTION = "users"
_VOICE_ID_FIELD = "elevenlabs_voice_id"


class VoiceCloningError(Exception):
    def __init__(self, message: str, error_type: str = "unknown"):
        self.message = message
        self.error_type = error_type
        super().__init__(message)


def check_voice_quota() -> None:
    """
    Check the ElevenLabs subscription quota before attempting to clone a voice.

    Calls GET /v1/user/subscription and compares voice_count to voice_limit.
    Raises VoiceCloningError(error_type='quota') when the limit is reached so the
    caller can return a 422 with a user-friendly message instead of letting the
    clone attempt fail with an opaque 422 from ElevenLabs.

    Network failures during the quota check are logged but do NOT block the clone
    attempt — if ElevenLabs is unreachable for the check it will also fail for the
    clone, and that error path is already handled.
    """
    if not ELEVENLABS_API_KEY:
        # Config error is caught by create_cloned_voice's own check; skip here.
        return

    try:
        response = requests.get(
            "https://api.elevenlabs.io/v1/user/subscription",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            timeout=10,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("ElevenLabs quota check network error (skipping): %s", exc)
        return

    if response.status_code != 200:
        logger.warning("ElevenLabs quota check returned %s (skipping)", response.status_code)
        return

    try:
        data = response.json()
        voice_limit = data.get("voice_limit", 0)
        voice_count = data.get("voice_count", 0)
    except Exception:
        logger.warning("Could not parse ElevenLabs subscription response (skipping quota check)")
        return

    if voice_limit > 0 and voice_count >= voice_limit:
        raise VoiceCloningError(
            f"Voice profile limit reached ({voice_count}/{voice_limit}). "
            "Your training will continue with our standard voice.",
            "quota",
        )


def create_cloned_voice(user_id: str, audio_paths: list, user_name: str = "User") -> str:
    """
    Create an ElevenLabs Instant Voice Clone from one or more audio samples
    and persist the returned voice_id to Firestore.

    ElevenLabs recommends at least 30 seconds of clean audio for best results.
    Supported formats: mp3, wav, m4a. Returns the new voice_id string.
    """
    if not ELEVENLABS_API_KEY:
        raise VoiceCloningError("ElevenLabs API key not configured.", "config")

    # Pre-flight quota check — fail fast with a clear message before uploading audio.
    check_voice_quota()

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

    if response.status_code not in (200, 201):
        detail = response.text
        try:
            body = response.json()
            d = body.get("detail", response.text)
            # ElevenLabs can return detail as a string OR as {"status":…,"message":…}
            detail = d.get("message", response.text) if isinstance(d, dict) else str(d)
        except Exception:
            pass
        raise VoiceCloningError(
            f"ElevenLabs error ({response.status_code}): {detail}", "api"
        )

    voice_id = response.json().get("voice_id")
    if not voice_id:
        raise VoiceCloningError("ElevenLabs returned no voice_id.", "api")

    _save_voice_id(user_id, voice_id)
    logger.info("Voice cloned for user %s -> voice_id=%s", user_id[:8], voice_id)
    return voice_id


def get_user_voice_id(user_id: str) -> str:
    """Return the user's cloned voice_id, or the default voice if none exists."""
    voice_id = _load_voice_id(user_id)
    return voice_id if voice_id else DEFAULT_VOICE_ID


def has_cloned_voice(user_id: str) -> bool:
    """Return True if a cloned voice_id exists for this user in Firestore."""
    return _load_voice_id(user_id) is not None


def delete_cloned_voice(user_id: str) -> bool:
    """
    Delete the user's cloned voice from ElevenLabs and remove the voice_id
    from Firestore. Returns False if no voice_id exists for this user.
    """
    voice_id = _load_voice_id(user_id)
    if not voice_id:
        return False

    # Best-effort deletion from ElevenLabs — do not block on failure.
    if ELEVENLABS_API_KEY:
        try:
            requests.delete(
                f"https://api.elevenlabs.io/v1/voices/{voice_id}",
                headers={"xi-api-key": ELEVENLABS_API_KEY},
                timeout=15,
            )
        except Exception as exc:
            logger.warning("Failed to delete ElevenLabs voice: %s", exc)

    _clear_voice_id(user_id)
    return True


# ── Firestore helpers ─────────────────────────────────────────────────────────

def _user_doc_ref(user_id: str):
    """Return a Firestore DocumentReference for users/{user_id}."""
    return firestore.client().collection(_USERS_COLLECTION).document(user_id)


def _save_voice_id(user_id: str, voice_id: str) -> None:
    """Write (or overwrite) the voice_id field on the user's Firestore document."""
    _user_doc_ref(user_id).set(
        {_VOICE_ID_FIELD: voice_id},
        merge=True,
    )


def _load_voice_id(user_id: str) -> str | None:
    """
    Read the voice_id field from Firestore.
    Returns None if the document or field does not exist.
    """
    try:
        doc = _user_doc_ref(user_id).get()
        if not doc.exists:
            return None
        return doc.to_dict().get(_VOICE_ID_FIELD)
    except Exception as exc:
        logger.warning("Failed to read voice_id from Firestore: %s", exc)
        return None


def _clear_voice_id(user_id: str) -> None:
    """Remove the voice_id field from the user's Firestore document."""
    try:
        _user_doc_ref(user_id).update(
            {_VOICE_ID_FIELD: firestore.DELETE_FIELD}
        )
    except Exception as exc:
        logger.warning("Failed to clear voice_id from Firestore: %s", exc)
