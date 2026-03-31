from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

router = APIRouter()

AUDIO_DIR = Path("temp_audio")

# Maps file extensions to their correct MIME types.
AUDIO_MEDIA_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
}


@router.get("/audio/{filename}")
def get_audio_file(filename: str):
    """
    Serve a generated audio file from the temp_audio directory.

    The filename parameter is validated against path traversal attacks by
    resolving both the requested path and the audio directory to absolute
    paths and confirming the file is within the directory.
    """
    file_path = (AUDIO_DIR / filename).resolve()
    audio_dir_resolved = AUDIO_DIR.resolve()

    # Reject any path that escapes the temp_audio directory.
    # Without this check, a caller could request "../config.py" and read
    # arbitrary server-side files.
    if not str(file_path).startswith(str(audio_dir_resolved)):
        raise HTTPException(status_code=400, detail="Invalid file path.")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found.")

    media_type = AUDIO_MEDIA_TYPES.get(file_path.suffix.lower(), "audio/mpeg")

    return FileResponse(file_path, media_type=media_type, filename=file_path.name)
