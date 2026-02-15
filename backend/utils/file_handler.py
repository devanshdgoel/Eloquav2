import logging
import time
import uuid
from pathlib import Path
from fastapi import UploadFile

from config import TEMP_AUDIO_MAX_AGE_MINUTES

logger = logging.getLogger(__name__)

TEMP_AUDIO_DIR = Path("temp_audio")


def save_uploaded_audio(file: UploadFile) -> Path:
    TEMP_AUDIO_DIR.mkdir(exist_ok=True)

    unique_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = TEMP_AUDIO_DIR / unique_name

    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return file_path


def cleanup_old_files() -> int:
    """Remove temp audio files older than TEMP_AUDIO_MAX_AGE_MINUTES. Returns count of deleted files."""
    if not TEMP_AUDIO_DIR.exists():
        return 0

    cutoff = time.time() - (TEMP_AUDIO_MAX_AGE_MINUTES * 60)
    deleted = 0

    for file_path in TEMP_AUDIO_DIR.iterdir():
        if file_path.is_file() and file_path.stat().st_mtime < cutoff:
            try:
                file_path.unlink()
                deleted += 1
            except OSError as e:
                logger.warning("Failed to delete temp file %s: %s", file_path, e)

    if deleted:
        logger.info("Cleaned up %d old temp audio file(s)", deleted)

    return deleted
