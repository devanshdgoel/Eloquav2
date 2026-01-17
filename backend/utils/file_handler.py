import uuid
from pathlib import Path
from fastapi import UploadFile

TEMP_AUDIO_DIR = Path("temp_audio")

def save_uploaded_audio(file: UploadFile) -> Path:
    TEMP_AUDIO_DIR.mkdir(exist_ok=True)

    unique_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = TEMP_AUDIO_DIR / unique_name

    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return file_path
