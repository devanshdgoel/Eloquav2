from fastapi import APIRouter, UploadFile, File, HTTPException
from services.speech_service import transcribe_audio, TranscriptionError

router = APIRouter()

@router.post("/process-audio")
async def process_audio(file: UploadFile = File(...)):
    audio_path = "temp.wav"
    with open(audio_path, "wb") as f:
        f.write(await file.read())

    try:
        text = transcribe_audio(audio_path)
    except TranscriptionError as e:
        raise HTTPException(status_code=400, detail=e.message)

    return {
        "raw_transcript": text
    }
