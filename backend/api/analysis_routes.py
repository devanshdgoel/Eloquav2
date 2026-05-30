import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

from config import MAX_AUDIO_SIZE_MB
from services.voice_analysis_service import extract_features, save_session
from utils.auth_dep import get_current_user
from utils.file_handler import save_uploaded_audio
from utils.responses import success_response
from utils.validators import is_valid_audio

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze-voice")
async def analyze_voice(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    task_type: str = Form("free_speech"),
    transcript: str = Form(""),
    audio_duration_s: float = Form(0.0),
    current_user: dict = Depends(get_current_user),
):
    """
    Extract acoustic features from a voice recording and store the session
    in Firestore under users/{uid}/voice_sessions/.

    Called after each speech enhancement session (fire-and-forget from the
    frontend) and from dedicated baseline / exercise tasks.

    task_type values:
      free_speech  — conversational recording from Speech Enhancement
      sustained_a  — 5–10 s sustained /a/ vowel (most reliable for perturbation)
      reading      — standardised passage read aloud
      ddk          — /pa-ta-ka/ diadochokinetic task

    Returns the extracted features, 0–100 scores, and quality metadata.
    Persisting to Firestore runs as a background task so the response is fast.
    """
    if not is_valid_audio(file.filename):
        raise HTTPException(status_code=400, detail="Invalid audio format.")

    contents = await file.read()
    if len(contents) > MAX_AUDIO_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large.")
    await file.seek(0)

    user_id = current_user["uid"]
    audio_path = save_uploaded_audio(file)

    try:
        analysis = extract_features(
            str(audio_path),
            transcript=transcript,
            audio_duration_s=audio_duration_s,
            task_type=task_type,
        )
    except Exception as exc:
        logger.error("Voice analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail="Voice analysis failed.")

    background_tasks.add_task(
        save_session,
        uid=user_id,
        analysis=analysis,
        task_type=task_type,
        transcript=transcript,
        audio_duration_s=audio_duration_s,
    )

    return success_response({
        "features": analysis["features"],
        "scores":   analysis["scores"],
        "quality":  analysis["quality"],
    })


@router.get("/voice-history")
async def get_voice_history(
    limit: int = 30,
    current_user: dict = Depends(get_current_user),
):
    """
    Fetch recent voice sessions for the authenticated user from Firestore.
    Returns up to `limit` sessions ordered by recorded_at descending.
    """
    user_id = current_user["uid"]

    try:
        from firebase_admin import firestore
        db = firestore.client()
        sessions_ref = (
            db.collection("users")
            .document(user_id)
            .collection("voice_sessions")
            .order_by("recorded_at", direction=firestore.Query.DESCENDING)
            .limit(min(limit, 100))
        )
        docs = sessions_ref.stream()
        sessions = []
        for doc in docs:
            data = doc.to_dict()
            ts = data.get("recorded_at")
            if hasattr(ts, "isoformat"):
                data["recorded_at"] = ts.isoformat()
            elif hasattr(ts, "timestamp"):
                from datetime import datetime, timezone
                data["recorded_at"] = datetime.fromtimestamp(
                    ts.timestamp(), tz=timezone.utc
                ).isoformat()
            data["session_id"] = doc.id
            sessions.append(data)

        return success_response({"sessions": sessions, "count": len(sessions)})

    except Exception as exc:
        logger.error("Failed to fetch voice history for %s: %s", user_id[:8], exc)
        raise HTTPException(status_code=500, detail="Could not load voice history.")
