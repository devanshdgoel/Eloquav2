import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Form, HTTPException

from utils.responses import success_response

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/save-assessment")
async def save_assessment(
    assessment_type: str = Form("baseline"),   # "baseline" | "checkin"
    user_id: str = Form(...),
    voice_power: Optional[int] = Form(None),
    expression: Optional[int] = Form(None),
    fluency: Optional[int] = Form(None),
    task_results_json: str = Form("{}"),
):
    """
    Persist a structured voice assessment (baseline or periodic check-in).

    The frontend records three tasks (sustained_a, reading, free_speech),
    submits each to /api/analyze-voice, then calls this endpoint with the
    composite scores and per-task breakdowns.

    Baseline: written to users/{uid}/assessments/baseline (single doc).
    Check-in: appended to users/{uid}/check_ins/{auto_id}.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    try:
        task_results = json.loads(task_results_json)
    except (json.JSONDecodeError, TypeError):
        task_results = {}

    try:
        from firebase_admin import firestore
        db = firestore.client()
        user_ref = db.collection("users").document(user_id)

        payload = {
            "recorded_at": firestore.SERVER_TIMESTAMP,
            "assessment_type": assessment_type,
            "composite": {
                "voice_power": voice_power,
                "expression":  expression,
                "fluency":     fluency,
            },
            "tasks": task_results,
        }

        if assessment_type == "baseline":
            user_ref.collection("assessments").document("baseline").set(payload)
            doc_id = "baseline"
        else:
            ref = user_ref.collection("check_ins").document()
            ref.set(payload)
            doc_id = ref.id

        logger.info("Assessment (%s) saved: users/%s", assessment_type, user_id[:8])
        return success_response({"doc_id": doc_id, "assessment_type": assessment_type})

    except Exception as exc:
        logger.error("Failed to save assessment: %s", exc)
        raise HTTPException(status_code=500, detail="Could not save assessment.")


TOTAL_NODES = 20


@router.post("/complete-session")
async def complete_session(
    user_id: str = Form(...),
    assessment_type: str = Form("baseline"),  # "baseline" | "checkin"
):
    """
    Increment sessions_completed, maintain streak, update roadmap node.
    Uses Admin SDK so it bypasses Firestore security rules.
    If assessment_type == 'checkin', also records last_checkin_session.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    try:
        from firebase_admin import firestore
        db  = firestore.client()
        ref = db.collection("user_progress").document(user_id)
        snap = ref.get()

        today_str     = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yesterday_str = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

        if not snap.exists:
            data = {
                "current_node":         min(TOTAL_NODES - 1, 1),
                "sessions_completed":   1,
                "streak_days":          1,
                "last_session_date":    today_str,
                "last_checkin_session": 1 if assessment_type == "checkin" else 0,
            }
            ref.set(data)
        else:
            prev     = snap.to_dict()
            sessions = prev.get("sessions_completed", 0) + 1
            streak   = prev.get("streak_days", 0)
            last_dt  = prev.get("last_session_date", "")

            if last_dt == today_str:
                pass
            elif last_dt == yesterday_str:
                streak += 1
            else:
                streak = 1

            data = {
                "current_node":       min(TOTAL_NODES - 1, sessions),
                "sessions_completed": sessions,
                "streak_days":        streak,
                "last_session_date":  today_str,
            }
            if assessment_type == "checkin":
                data["last_checkin_session"] = sessions

            ref.update(data)

        logger.info("Session completed (type=%s) for user %s", assessment_type, user_id[:8])
        return success_response(data)

    except Exception as exc:
        logger.error("complete_session failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not update session progress.")


@router.get("/progress-data")
async def get_progress_data(user_id: Optional[str] = None):
    """
    Fetch baseline + check-ins + recent passive sessions for the Progress screen.

    Returns:
      has_baseline  — whether the user has completed their initial assessment
      baseline      — composite scores from the initial assessment
      check_ins     — all periodic check-ins (ascending for sparkline)
      recent_sessions — last 10 passive voice_sessions
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    try:
        from firebase_admin import firestore
        from datetime import datetime, timezone
        db = firestore.client()
        user_ref = db.collection("users").document(user_id)

        def _ts(d, key="recorded_at"):
            ts = d.get(key)
            if ts is None:
                return None
            if hasattr(ts, "isoformat"):
                return ts.isoformat()
            if hasattr(ts, "timestamp"):
                return datetime.fromtimestamp(ts.timestamp(), tz=timezone.utc).isoformat()
            return None

        # Baseline
        baseline_doc = user_ref.collection("assessments").document("baseline").get()
        baseline = None
        if baseline_doc.exists:
            baseline = baseline_doc.to_dict()
            baseline["recorded_at"] = _ts(baseline)

        # Check-ins — ascending so sparkline renders left → right
        checkin_docs = (
            user_ref.collection("check_ins")
            .order_by("recorded_at", direction=firestore.Query.ASCENDING)
            .limit(20)
            .stream()
        )
        check_ins = []
        for doc in checkin_docs:
            d = doc.to_dict()
            d["recorded_at"] = _ts(d)
            d["doc_id"] = doc.id
            check_ins.append(d)

        # Recent passive sessions (descending — latest first)
        session_docs = (
            user_ref.collection("voice_sessions")
            .order_by("recorded_at", direction=firestore.Query.DESCENDING)
            .limit(10)
            .stream()
        )
        recent_sessions = []
        for doc in session_docs:
            d = doc.to_dict()
            d["recorded_at"] = _ts(d)
            d["doc_id"] = doc.id
            recent_sessions.append(d)

        return success_response({
            "has_baseline":      baseline is not None,
            "baseline":          baseline,
            "check_ins":         check_ins,
            "recent_sessions":   recent_sessions,
        })

    except Exception as exc:
        logger.error("Failed to fetch progress data for %s: %s",
                     user_id[:8] if user_id else "?", exc)
        raise HTTPException(status_code=500, detail="Could not load progress data.")
