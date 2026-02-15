import logging

from fastapi import APIRouter, UploadFile, File, HTTPException

from config import MAX_AUDIO_SIZE_MB
from utils.validators import is_valid_audio
from utils.file_handler import save_uploaded_audio, cleanup_old_files
from utils.responses import success_response, error_response

from services.speech_service import transcribe_audio, TranscriptionError
from services.clarity_speech import clarity_transcript
from services.enhancement_service import generate_enhanced_speech, SpeechEnhancementError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/process-audio")
async def process_audio(file: UploadFile = File(...)):
    # Clean up old temp files on each request
    cleanup_old_files()

    # 1. Validate audio format
    if not is_valid_audio(file.filename):
        raise HTTPException(
            status_code=400,
            detail="Invalid audio format. Please upload wav, mp3, or m4a."
        )

    # 2. Validate file size
    contents = await file.read()
    max_bytes = MAX_AUDIO_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_AUDIO_SIZE_MB}MB."
        )
    # Reset file position for save
    await file.seek(0)

    # 3. Save audio
    audio_path = save_uploaded_audio(file)

    # 4. Transcribe
    try:
        raw_transcript = transcribe_audio(str(audio_path))
    except TranscriptionError as e:
        if e.error_type == "empty":
            return error_response(e.message, error_type="empty")

        if e.error_type in ["quota", "network"]:
            raise HTTPException(status_code=503, detail=e.message)

        raise HTTPException(status_code=500, detail=e.message)

    # 5. Clarity enhancement
    cleaned_transcript = clarity_transcript(raw_transcript)

    # 6. Generate enhanced speech
    audio_url = None
    try:
        enhanced_path = generate_enhanced_speech(cleaned_transcript)
        audio_url = f"/api/audio/{enhanced_path.name}"
    except SpeechEnhancementError as e:
        logger.warning("Speech enhancement failed: %s", e)

    # 7. Respond
    return success_response({
        "raw_transcript": raw_transcript,
        "cleaned_transcript": cleaned_transcript,
        "clarity_applied": cleaned_transcript != raw_transcript,
        "audio_url": audio_url,
    })
