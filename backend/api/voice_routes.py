import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.voice_cloning_service import (
    VoiceCloningError,
    create_cloned_voice,
    delete_cloned_voice,
    get_user_voice_id,
    has_cloned_voice,
)
from utils.validators import is_valid_audio

logger = logging.getLogger(__name__)

router = APIRouter()

# Temporary storage for voice samples during the cloning request.
# Files are deleted immediately after ElevenLabs processes them.
VOICE_SAMPLES_DIR = Path("temp_audio/voice_samples")
VOICE_SAMPLES_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/voice/clone")
async def clone_voice(
    files: list[UploadFile] = File(...),
    user_id: str = Form(...),
    user_name: str = Form(default="User"),
):
    """
    Upload voice samples and create an ElevenLabs Instant Voice Clone.

    Accepts 1-25 audio files (wav, mp3, m4a). More audio yields better quality;
    ElevenLabs recommends at least 30 seconds of clean speech in total.
    The cloned voice_id is stored server-side and used automatically in
    /api/process-audio whenever the same user_id is provided.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No audio files provided.")

    # Save each valid audio file to disk before forwarding to ElevenLabs.
    saved_paths = []
    for f in files:
        if not is_valid_audio(f.filename):
            logger.warning("Skipping unsupported file type: %s", f.filename)
            continue
        ext = Path(f.filename).suffix or ".m4a"
        save_path = VOICE_SAMPLES_DIR / f"sample_{user_id}_{uuid.uuid4().hex}{ext}"
        content = await f.read()
        with open(save_path, "wb") as out:
            out.write(content)
        saved_paths.append(save_path)

    if not saved_paths:
        raise HTTPException(
            status_code=400,
            detail="No valid audio files. Supported formats: wav, mp3, m4a.",
        )

    try:
        voice_id = create_cloned_voice(user_id, saved_paths, user_name)
    except VoiceCloningError as e:
        status_code = 503 if e.error_type == "network" else 500
        raise HTTPException(status_code=status_code, detail=e.message)
    finally:
        # Always clean up local samples regardless of success or failure.
        for path in saved_paths:
            try:
                path.unlink()
            except OSError:
                pass

    return {
        "status": "success",
        "voice_id": voice_id,
        "message": "Voice cloned successfully. Your enhanced speech will now use your voice.",
    }


@router.get("/voice/status")
async def voice_status(user_id: str):
    """
    Check whether a user has a cloned voice on file.

    Returns:
        has_cloned_voice: True if a clone exists.
        voice_id: The active voice_id (cloned or default).
        is_default: True when falling back to the shared default voice.
    """
    cloned = has_cloned_voice(user_id)
    return {
        "has_cloned_voice": cloned,
        "voice_id": get_user_voice_id(user_id),
        "is_default": not cloned,
    }


@router.delete("/voice/clone")
async def remove_cloned_voice(user_id: str):
    """
    Delete a user's cloned voice from ElevenLabs and remove the local profile.

    Returns 404 if no cloned voice exists for this user.
    """
    deleted = delete_cloned_voice(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="No cloned voice found for this user.")
    return {"status": "success", "message": "Cloned voice deleted."}
