import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from config import MAX_AUDIO_SIZE_MB
from services.clarity_speech import clarity_transcript
from services.enhancement_service import SpeechEnhancementError, generate_enhanced_speech
from services.speech_service import TranscriptionError, transcribe_audio
from services.voice_cloning_service import get_user_voice_id, has_cloned_voice
from services.voice_profile_service import DEFAULT_PROFILE, analyze_voice
from utils.file_handler import cleanup_old_files, save_uploaded_audio
from utils.responses import error_response, success_response
from utils.validators import is_valid_audio

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/process-audio")
async def process_audio(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
):
    """
    Transcribe audio, apply clarity enhancement, and generate enhanced speech.

    If a user_id is provided and the user has a cloned voice on file, that voice
    is used for synthesis. Otherwise, voice profile matching selects the best
    ElevenLabs default voice based on the user's pitch, speaking rate, and energy.

    Returns:
        raw_transcript: Whisper transcription before editing.
        cleaned_transcript: Transcript after clarity enhancement.
        clarity_applied: True if the cleaned transcript differs from the raw one.
        audio_url: Relative URL to the generated audio file, or null on failure.
        voice_profile: The voice profile metadata used for synthesis.
    """
    # Clean up old temp files on each request to prevent disk accumulation.
    cleanup_old_files()

    # 1. Validate audio format
    if not is_valid_audio(file.filename):
        raise HTTPException(
            status_code=400,
            detail="Invalid audio format. Please upload wav, mp3, or m4a.",
        )

    # 2. Validate file size
    contents = await file.read()
    max_bytes = MAX_AUDIO_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_AUDIO_SIZE_MB}MB.",
        )
    await file.seek(0)

    # 3. Save audio to disk
    audio_path = save_uploaded_audio(file)

    # 4. Transcribe — verbose_json mode returns both the transcript and audio
    #    duration, which is needed for speaking-rate analysis in step 6.
    try:
        raw_transcript, audio_duration_s = transcribe_audio(str(audio_path))
    except TranscriptionError as e:
        if e.error_type == "empty":
            return error_response(e.message, error_type="empty")
        if e.error_type in ["quota", "network"]:
            raise HTTPException(status_code=503, detail=e.message)
        raise HTTPException(status_code=500, detail=e.message)

    # 5. Apply clarity enhancement (grammar / filler-word clean-up)
    cleaned_transcript = clarity_transcript(raw_transcript)

    # 6. Determine which voice to use for synthesis.
    #    Priority: cloned voice (if user has completed voice setup) > profile match.
    if user_id and has_cloned_voice(user_id):
        # Use the user's personal cloned voice with neutral settings.
        synthesis_voice_id = get_user_voice_id(user_id)
        voice_settings = {
            "stability": 0.50,
            "similarity_boost": 0.75,
            "style": 0.30,
            "speed": 1.0,
        }
        profile = DEFAULT_PROFILE
        logger.info("Using cloned voice for user %s", user_id[:8] if user_id else "unknown")
    else:
        # No clone on file — fall back to automatic voice profile matching.
        logger.info(
            "No cloned voice for user %s — using profile matching. "
            "(user_id received: %s, has_clone: %s)",
            user_id[:8] if user_id else "none",
            bool(user_id),
            has_cloned_voice(user_id) if user_id else False,
        )
        try:
            profile, voice_settings = analyze_voice(
                str(audio_path), raw_transcript, audio_duration_s
            )
            synthesis_voice_id = profile.voice_id
        except Exception as exc:
            logger.warning("Voice profile matching failed (%s) — using default", exc)
            profile = DEFAULT_PROFILE
            synthesis_voice_id = DEFAULT_PROFILE.voice_id
            voice_settings = {
                "stability": 0.50,
                "similarity_boost": 0.75,
                "style": 0.30,
                "speed": 1.0,
            }

    # 7. Generate enhanced speech audio
    audio_url = None
    try:
        enhanced_path = generate_enhanced_speech(
            cleaned_transcript,
            voice_id=synthesis_voice_id,
            voice_settings=voice_settings,
        )
        audio_url = f"/api/audio/{enhanced_path.name}"
    except SpeechEnhancementError as e:
        logger.warning("Speech enhancement failed: %s", e)

    # 8. Return all results to the client
    return success_response({
        "raw_transcript": raw_transcript,
        "cleaned_transcript": cleaned_transcript,
        "clarity_applied": cleaned_transcript != raw_transcript,
        "audio_url": audio_url,
        "voice_profile": profile.to_dict(),
    })
