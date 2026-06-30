import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from config import MAX_AUDIO_SIZE_MB
from services.clarity_speech import clarity_transcript, clarity_transcript_chunked, clarity_final_pass
from services.enhancement_service import SpeechEnhancementError, generate_enhanced_speech
from services.soniva_service import transcribe_soniva
from services.speech_service import TranscriptionError, transcribe_audio
from services.voice_cloning_service import get_user_voice_id, has_cloned_voice
from services.voice_profile_service import DEFAULT_PROFILE, analyze_voice
from utils.auth_dep import get_current_user
from utils.file_handler import cleanup_old_files, save_uploaded_audio
from utils.responses import error_response, success_response
from utils.validators import is_valid_audio

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Hallucination filter ──────────────────────────────────────────────────────
# Whisper was trained on YouTube/subtitle data and fills silence with common
# phrases. We use substring matching so variants like "thank you for watching
# my video" are also caught.
_HALLUCINATION_SUBSTRINGS = [
    "thank you for watching",
    "thanks for watching",
    "please subscribe",
    "like and subscribe",
    "don't forget to subscribe",
    "subscribe to my channel",
    "see you in the next video",
    "see you next time",
    "subtitles by",
    "amara.org",
    "www.",
    ".com",
]

# Chunks below this size are almost certainly silence — skip Whisper entirely.
# Note: a 4-second AAC clip at typical quality is ~50–80 KB even for silence,
# so this only catches near-empty (truly empty) files.
_MIN_CHUNK_BYTES = 5_000

# One-word responses that are plausible real utterances
_VALID_SINGLE_WORDS = {
    "yes", "no", "ok", "okay", "hello", "hi", "bye", "help",
    "stop", "go", "wait", "please", "thanks", "sorry", "yeah",
    "good", "bad", "fine", "sure", "right", "left", "done",
}


def _is_hallucination(text: str, previous_enhanced_text: str = "") -> bool:
    if not text:
        return True
    lower = text.lower().strip()

    # Substring check — catches "thank you for watching my video." and variants
    for phrase in _HALLUCINATION_SUBSTRINGS:
        if phrase in lower:
            return True

    # Multiple dollar amounts = random price-list hallucination
    if lower.count("$") >= 3:
        return True

    # Single word that isn't a plausible short utterance
    words = lower.rstrip(" .,!?").split()
    if len(words) == 1 and words[0] not in _VALID_SINGLE_WORDS:
        return True

    # Repetition of the previous context — Whisper echoing back what it heard
    if previous_enhanced_text:
        prev_tail = previous_enhanced_text.lower()[-300:]
        if lower.rstrip(".,!? ") in prev_tail:
            return True

    return False


@router.post("/transcribe-chunk")
async def transcribe_chunk(
    file: UploadFile = File(...),
    chunk_index: int = Form(0),
    previous_text: str = Form(""),
    previous_enhanced_text: str = Form(""),
    model: str = Form("whisper"),
    current_user: dict = Depends(get_current_user),
):
    """
    Transcribe one 4-second audio chunk and immediately apply clarity enhancement.

    previous_text         — raw accumulated transcript, passed to Whisper as a prompt
                            for context continuity across chunk boundaries.
    previous_enhanced_text — enhanced accumulated transcript, passed to GPT so it can
                            handle sentences that span chunk boundaries.
    model                 — "whisper" (OpenAI API) or "soniva" (local fine-tuned model).

    Returns raw_text (model output) and enhanced_text (GPT-corrected) for this chunk.
    """
    if not is_valid_audio(file.filename):
        raise HTTPException(status_code=400, detail="Invalid audio format.")

    contents = await file.read()

    if len(contents) < _MIN_CHUNK_BYTES:
        return success_response({
            "raw_text": "",
            "enhanced_text": "",
            "chunk_index": chunk_index,
        })

    if len(contents) > MAX_AUDIO_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Chunk too large.")
    await file.seek(0)

    audio_path = save_uploaded_audio(file)

    try:
        if model == "soniva":
            raw_text, _ = transcribe_soniva(str(audio_path), prompt=previous_text)
        else:
            raw_text, _ = transcribe_audio(str(audio_path), prompt=previous_text)
    except TranscriptionError as e:
        if e.error_type == "empty":
            return success_response({
                "raw_text": "",
                "enhanced_text": "",
                "chunk_index": chunk_index,
            })
        raise HTTPException(status_code=503, detail=e.message)

    if _is_hallucination(raw_text, previous_enhanced_text):
        logger.info("Hallucination filtered at chunk %d: %r", chunk_index, raw_text)
        return success_response({
            "raw_text": "",
            "enhanced_text": "",
            "chunk_index": chunk_index,
        })

    enhanced_text = clarity_transcript_chunked(raw_text, previous_enhanced_text)

    return success_response({
        "raw_text": raw_text,
        "enhanced_text": enhanced_text,
        "chunk_index": chunk_index,
    })


@router.post("/enhance-text")
async def enhance_text_route(
    raw_transcript: str = Form(...),
    enhanced_transcript: str = Form(""),
    current_user: dict = Depends(get_current_user),
):
    """
    Final step of the chunked pipeline: generate ElevenLabs TTS audio.

    enhanced_transcript — the merged, already-GPT-enhanced text from per-chunk clarity.
                          When provided, the full GPT clarity pass is skipped (it was
                          already done per-chunk), saving latency and cost.
    raw_transcript      — always required; used as fallback and for the clarity_applied flag.
    """
    if not raw_transcript.strip():
        raise HTTPException(status_code=400, detail="raw_transcript is empty.")

    user_id = current_user["uid"]

    if enhanced_transcript.strip():
        final_transcript = enhanced_transcript.strip()
        logger.info("Running final coherence pass on accumulated enhanced transcript")
        final_transcript = clarity_final_pass(final_transcript)
    else:
        final_transcript = clarity_transcript(raw_transcript)

    using_cloned_voice = has_cloned_voice(user_id)
    if using_cloned_voice:
        synthesis_voice_id = get_user_voice_id(user_id)
        logger.info("enhance-text: using cloned voice for user %s", user_id[:8])
    else:
        synthesis_voice_id = DEFAULT_PROFILE.voice_id

    voice_settings = {
        "stability":        0.65,
        "similarity_boost": 0.85,
        "style":            0.20,
        "speed":            1.0,
    }

    audio_url = None
    try:
        enhanced_path = generate_enhanced_speech(
            final_transcript,
            voice_id=synthesis_voice_id,
            voice_settings=voice_settings,
        )
        audio_url = f"/api/audio/{enhanced_path.name}"
    except SpeechEnhancementError as e:
        logger.warning("enhance-text TTS failed: %s", e)

    return success_response({
        "cleaned_transcript": final_transcript,
        "clarity_applied": final_transcript != raw_transcript,
        "audio_url": audio_url,
        "voice_profile": {"cloned": True} if using_cloned_voice else DEFAULT_PROFILE.to_dict(),
    })


@router.post("/process-audio")
async def process_audio(
    file: UploadFile = File(...),
    model: str = Form("whisper"),
    current_user: dict = Depends(get_current_user),
):
    """
    Legacy single-shot endpoint: transcribe, enhance, and synthesise in one call.
    Used by FunctionalSpeechExercise for hear-and-repeat scoring.
    """
    cleanup_old_files()

    if not is_valid_audio(file.filename):
        raise HTTPException(
            status_code=400,
            detail="Invalid audio format. Please upload wav, mp3, or m4a.",
        )

    contents = await file.read()
    max_bytes = MAX_AUDIO_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_AUDIO_SIZE_MB}MB.",
        )
    await file.seek(0)

    user_id = current_user["uid"]
    audio_path = save_uploaded_audio(file)

    try:
        if model == "soniva":
            raw_transcript, audio_duration_s = transcribe_soniva(str(audio_path))
        else:
            raw_transcript, audio_duration_s = transcribe_audio(str(audio_path))
    except TranscriptionError as e:
        if e.error_type == "empty":
            return error_response(e.message, error_type="empty")
        if e.error_type in ["quota", "network"]:
            raise HTTPException(status_code=503, detail=e.message)
        raise HTTPException(status_code=500, detail=e.message)

    cleaned_transcript = clarity_transcript(raw_transcript)

    if has_cloned_voice(user_id):
        synthesis_voice_id = get_user_voice_id(user_id)
        voice_settings = {
            "stability":        0.65,
            "similarity_boost": 0.85,
            "style":            0.20,
            "speed":            1.0,
        }
        profile = DEFAULT_PROFILE
        logger.info("Using cloned voice for user %s", user_id[:8])
    else:
        logger.info("No cloned voice for user %s — using profile matching.", user_id[:8])
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

    return success_response({
        "raw_transcript": raw_transcript,
        "cleaned_transcript": cleaned_transcript,
        "clarity_applied": cleaned_transcript != raw_transcript,
        "audio_url": audio_url,
        "voice_profile": profile.to_dict(),
    })
