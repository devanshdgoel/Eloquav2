import os

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a"}

def is_valid_audio(filename: str) -> bool:
    if not filename:
        return False

    _, ext = os.path.splitext(filename.lower())
    return ext in ALLOWED_EXTENSIONS
