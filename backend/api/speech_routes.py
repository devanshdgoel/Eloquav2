import logging
import time
import uuid
from typing import Optional

import requests as _requests

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from config import ELEVENLABS_API_KEY, MAX_AUDIO_SIZE_MB
from services.clarity_speech import clarity_transcript, clarity_transcript_chunked, clarity_final_pass
from services.enhancement_service import SpeechEnhancementError, generate_enhanced_speech
from services.soniva_service import transcribe_soniva
from services.speech_service import TranscriptionError, transcribe_audio
from services.vocabulary_service import (
    extract_key_terms,
    format_vocabulary_hint,
    get_user_vocabulary_cached,
    get_user_examples,
    store_user_example,
    update_user_vocabulary,
)
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
_MIN_CHUNK_BYTES = 5_000

# One-word responses that are plausible real utterances
_VALID_SINGLE_WORDS = {
    "yes", "no", "ok", "okay", "hello", "hi", "bye", "help",
    "stop", "go", "wait", "please", "thanks", "sorry", "yeah",
    "good", "bad", "fine", "sure", "right", "left", "done",
}

# ── Streaming TTS token store ─────────────────────────────────────────────────
# Maps short-lived tokens to TTS generation params.
# /stream-tts/{token} uses these to pipe ElevenLabs streaming audio to the client.
# In-memory only — tokens expire after 10 min or on server restart (fine for single-process).
_tts_tokens: dict[str, dict] = {}
_TOKEN_TTL_S = 600  # 10 minutes

def _cleanup_tts_tokens():
    """Remove tokens older than TTL to prevent unbounded memory growth."""
    now = time.time()
    expired = [t for t, d in _tts_tokens.items() if now - d['created_at'] > _TOKEN_TTL_S]
    for t in expired:
        _tts_tokens.pop(t, None)


def _is_hallucination(text: str, previous_enhanced_text: str = "") -> bool:
    if not text:
        return True
    lower = text.lower().strip()

    for phrase in _HALLUCINATION_SUBSTRINGS:
        if phrase in lower:
            return True

    if lower.count("$") >= 3:
        return True

    words = lower.rstrip(" .,!?").split()
    if len(words) == 1 and words[0] not in _VALID_SINGLE_WORDS:
        return True

    if previous_enhanced_text:
        prev_tail = previous_enhanced_text.lower()[-300:]
        if lower.rstrip(".,!? ") in prev_tail:
            return True

    return False


def _build_whisper_prompt(vocab_words: list[str], previous_text: str) -> str:
    """
    Combine the user's stored vocabulary hint with the rolling transcript context
    that keeps Whisper's output consistent across chunk boundaries.

    The vocabulary hint goes first so Whisper loads these words into its decoder
    state before seeing the actual context — maximising their influence on
    ambiguous audio segments.
    """
    hint = format_vocabulary_hint(vocab_words)
    if hint and previous_text:
        return f"{hint}\n{previous_text}"
    return hint or previous_text


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
    user_id = current_user["uid"]

    # Fetch user vocabulary (cached — at most one Firestore read per 5 min per user)
    # and prepend it to the Whisper context prompt so the model recognises the user's
    # specific terms (names, medication names, places) from their previous sessions.
    vocab_words = get_user_vocabulary_cached(user_id)
    whisper_prompt = _build_whisper_prompt(vocab_words, previous_text)

    try:
        if model == "soniva":
            raw_text, _ = transcribe_soniva(str(audio_path), prompt=whisper_prompt)
        else:
            raw_text, _ = transcribe_audio(str(audio_path), prompt=whisper_prompt)
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

    # Per-chunk clarity: no few-shot examples here (called every 4 s — token cost adds up).
    # Examples are used only in the final pass once the full transcript is assembled.
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
    Final step of the chunked pipeline: run the coherence pass and generate TTS audio.

    enhanced_transcript — the merged, already-GPT-enhanced text from per-chunk clarity.
                          When provided, only the final coherence pass is run (not a full
                          clarity pass), saving latency and cost.
    raw_transcript      — always required; used as fallback and for the clarity_applied flag.
    """
    if not raw_transcript.strip():
        raise HTTPException(status_code=400, detail="raw_transcript is empty.")

    user_id = current_user["uid"]

    # Fetch this user's stored (raw → enhanced) example pairs for GPT few-shot.
    # These teach GPT the specific artefact patterns in this person's speech —
    # the more they use the app, the better the correction becomes.
    user_examples = get_user_examples(user_id)

    if enhanced_transcript.strip():
        final_transcript = enhanced_transcript.strip()
        logger.info("Running final coherence pass on accumulated enhanced transcript")
        final_transcript = clarity_final_pass(final_transcript, examples=user_examples)
    else:
        final_transcript = clarity_transcript(raw_transcript, examples=user_examples)

    # Background: extract vocabulary from the cleaned transcript and update user's
    # stored word list for future Whisper seeding. Non-blocking — never delays the response.
    try:
        new_terms = extract_key_terms(final_transcript)
        if new_terms:
            update_user_vocabulary(user_id, new_terms)
    except Exception as exc:
        logger.warning("Vocabulary update failed (non-fatal): %s", exc)

    # Background: store this (raw, enhanced) pair so future sessions can use it
    # as a few-shot example for this user's specific speech patterns.
    try:
        store_user_example(user_id, raw_transcript, final_transcript)
    except Exception as exc:
        logger.warning("Example storage failed (non-fatal): %s", exc)

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

    # Store TTS params under a one-time token so the client can stream audio
    # directly from /stream-tts/{token} without us generating and storing a file first.
    # This lets the client start buffering ElevenLabs audio immediately after receiving
    # the text — cutting time-to-first-audio from ~5s to ~1.5s.
    _cleanup_tts_tokens()
    stream_token = None
    if ELEVENLABS_API_KEY:
        stream_token = uuid.uuid4().hex
        _tts_tokens[stream_token] = {
            'text':       final_transcript,
            'voice_id':   synthesis_voice_id,
            'settings':   voice_settings,
            'created_at': time.time(),
        }
        logger.info("enhance-text: created stream_token for user %s", user_id[:8])

    return success_response({
        "cleaned_transcript": final_transcript,
        "clarity_applied":    final_transcript != raw_transcript,
        "audio_url":          None,
        "stream_token":       stream_token,
        "voice_profile":      {"cloned": True} if using_cloned_voice else DEFAULT_PROFILE.to_dict(),
    })


@router.get("/stream-tts/{token}")
def stream_tts(token: str):
    """
    Stream ElevenLabs TTS audio for a previously-enhanced transcript.

    Tokens are created by /enhance-text and expire after 10 minutes.
    This endpoint is intentionally unprotected — the 32-char random token
    provides sufficient security for a ~10-minute window.

    Returns audio/mpeg chunks as they arrive from ElevenLabs, allowing the
    mobile client to start playing within ~1.5s rather than waiting for the
    full file to be generated (~3-5s).
    """
    _cleanup_tts_tokens()
    # Pop the token so it can only be used once (prevents replay).
    data = _tts_tokens.pop(token, None)

    if not data:
        raise HTTPException(status_code=404, detail="TTS token not found or expired.")

    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured.")

    voice_id = data['voice_id']
    text     = data['text']
    settings = data['settings']

    def _generate():
        # Call the ElevenLabs streaming endpoint — it returns audio chunks
        # as the model generates them, so we can start yielding immediately
        # rather than waiting for the full waveform.
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
        headers = {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Accept":     "audio/mpeg",
        }
        payload = {
            "text":           text,
            "model_id":       "eleven_turbo_v2_5",
            "voice_settings": settings,
        }
        try:
            resp = _requests.post(url, json=payload, headers=headers, stream=True, timeout=30)
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=4096):
                if chunk:
                    yield chunk
        except Exception as e:
            logger.error("stream-tts ElevenLabs error: %s", e)
            # Can't send an HTTP error after streaming has started — just stop

    return StreamingResponse(_generate(), media_type="audio/mpeg")


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

    # Seed Whisper with this user's stored vocabulary for better recognition.
    vocab_words  = get_user_vocabulary_cached(user_id)
    whisper_prompt = format_vocabulary_hint(vocab_words)

    try:
        if model == "soniva":
            raw_transcript, audio_duration_s = transcribe_soniva(str(audio_path), prompt=whisper_prompt)
        else:
            raw_transcript, audio_duration_s = transcribe_audio(str(audio_path), prompt=whisper_prompt)
    except TranscriptionError as e:
        if e.error_type == "empty":
            return error_response(e.message, error_type="empty")
        if e.error_type in ["quota", "network"]:
            raise HTTPException(status_code=503, detail=e.message)
        raise HTTPException(status_code=500, detail=e.message)

    # Include user's few-shot examples in the clarity prompt.
    user_examples    = get_user_examples(user_id)
    cleaned_transcript = clarity_transcript(raw_transcript, examples=user_examples)

    # Background vocabulary and example updates — non-blocking.
    try:
        new_terms = extract_key_terms(cleaned_transcript)
        if new_terms:
            update_user_vocabulary(user_id, new_terms)
    except Exception as exc:
        logger.warning("Vocabulary update failed (non-fatal): %s", exc)

    try:
        store_user_example(user_id, raw_transcript, cleaned_transcript)
    except Exception as exc:
        logger.warning("Example storage failed (non-fatal): %s", exc)

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
