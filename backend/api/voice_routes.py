from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from pathlib import Path
import uuid

from utils.validators import is_valid_audio
from services.voice_cloning_service import (
    create_cloned_voice,
    get_user_voice_id,
    has_cloned_voice,
    delete_cloned_voice,
    VoiceCloningError,
)

router = APIRouter()

VOICE_SAMPLES_DIR = Path("temp_audio/voice_samples")
VOICE_SAMPLES_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/voice/clone")
async def clone_voice(
    files: list[UploadFile] = File(...),
    user_id: str = Form(default="demo_user"),
    user_name: str = Form(default="User"),
):
    """
    Upload voice samples and create a cloned voice via ElevenLabs.
    Accepts 1-25 audio files. More samples = better quality.
    Recommended: at least 30 seconds total audio.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No audio files provided")

    # Save uploaded files
    saved_paths = []
    for f in files:
        if not is_valid_audio(f.filename):
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
            detail="No valid audio files. Supported: wav, mp3, m4a"
        )

    try:
        voice_id = create_cloned_voice(user_id, saved_paths, user_name)
    except VoiceCloningError as e:
        status = 503 if e.error_type == "network" else 500
        raise HTTPException(status_code=status, detail=e.message)

    # Clean up sample files after cloning
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
async def voice_status(user_id: str = "demo_user"):
    """Check if a user has a cloned voice."""
    return {
        "has_cloned_voice": has_cloned_voice(user_id),
        "voice_id": get_user_voice_id(user_id),
        "is_default": not has_cloned_voice(user_id),
    }


@router.delete("/voice/clone")
async def remove_cloned_voice(user_id: str = "demo_user"):
    """Delete a user's cloned voice."""
    deleted = delete_cloned_voice(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="No cloned voice found for this user")
    return {"status": "success", "message": "Cloned voice deleted"}
