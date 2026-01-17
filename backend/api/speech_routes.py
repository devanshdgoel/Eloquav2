from fastapi import APIRouter, UploadFile, File, HTTPException

from utils.validators import is_valid_audio
from utils.file_handler import save_uploaded_audio

from services.speech_service import transcribe_audio, TranscriptionError
from services.clarity_speech import clarity_transcript

router = APIRouter()


@router.post("/process-audio")
async def process_audio(file: UploadFile = File(...)):
    # 1. Validate audio
    if not is_valid_audio(file.filename):
        raise HTTPException(
            status_code=400,
            detail="Invalid audio format. Please upload wav, mp3, or m4a."
        )

    # 2. Save audio
    audio_path = save_uploaded_audio(file)

    # 3. Transcribe
    try:
        raw_transcript = transcribe_audio(str(audio_path))
    except TranscriptionError as e:
        if e.error_type == "empty":
            return {
                "status": "partial",
                "raw_transcript": None,
                "cleaned_transcript": None,
                "error_type": "empty",
                "message": e.message
            }

        if e.error_type in ["quota", "network"]:
            raise HTTPException(status_code=503, detail=e.message)

        raise HTTPException(status_code=500, detail=e.message)

    # 4. Clarity (non-blocking)
    cleaned_transcript = clarity_transcript(raw_transcript)

    # 5. Respond
    return {
        "status": "success",
        "raw_transcript": raw_transcript,
        "cleaned_transcript": cleaned_transcript,
        "clarity_applied": cleaned_transcript != raw_transcript
    }
