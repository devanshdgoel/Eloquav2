from fastapi import APIRouter 
from fastapi.responses import FileResponse 
from pathlib import Path

router = APIRouter()

AUDIO_DIR = Path("temp_audio")

@router.get("/audio/{filename}")
def get_audio_file(filename:str):
    file_path = AUDIO_DIR / filename

    if not file_path.exists():
        return {"error": "Audio file not found"}
    
    return FileResponse(
        file_path, 
        media_type="audio/mpeg",
        filename=filename
    )