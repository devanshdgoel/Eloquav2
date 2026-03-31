from datetime import date, timedelta

from fastapi import APIRouter, Depends

from database import get_connection
from utils.auth_dep import get_current_user
from utils.responses import success_response

router = APIRouter()

# Number of sessions required to advance from each node to the next.
# Node indices: 4 = beginner (bottom of map), 0 = advanced (top of map).
_SESSIONS_PER_NODE = 3


def _calc_node(sessions_completed: int) -> int:
    """Return the current node index (0–4) for a given session count."""
    return max(0, 4 - (sessions_completed // _SESSIONS_PER_NODE))


@router.get("/progress")
def get_progress(user: dict = Depends(get_current_user)):
    """Return the authenticated user's current roadmap node, streak, and session count."""
    user_id = user["user_id"]
    with get_connection() as conn:
        row = conn.execute(
            "SELECT current_node, sessions_completed, streak_days "
            "FROM user_progress WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    if not row:
        return success_response({"current_node": 4, "sessions_completed": 0, "streak_days": 0})
    return success_response(dict(row))


@router.post("/progress/complete-session")
def complete_session(user: dict = Depends(get_current_user)):
    """Record a completed training session and update node / streak accordingly."""
    user_id = user["user_id"]
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    with get_connection() as conn:
        row = conn.execute(
            "SELECT sessions_completed, streak_days, last_session_date "
            "FROM user_progress WHERE user_id = ?",
            (user_id,),
        ).fetchone()

        if not row:
            new_node = _calc_node(1)
            conn.execute(
                "INSERT INTO user_progress "
                "(user_id, current_node, sessions_completed, streak_days, last_session_date) "
                "VALUES (?, ?, 1, 1, ?)",
                (user_id, new_node, today),
            )
            conn.commit()
            return success_response(
                {"current_node": new_node, "sessions_completed": 1, "streak_days": 1}
            )

        sessions = row["sessions_completed"] + 1
        last_date = row["last_session_date"]

        # Streak logic
        if last_date == today:
            streak = row["streak_days"]          # already counted today
        elif last_date == yesterday:
            streak = row["streak_days"] + 1      # consecutive day
        else:
            streak = 1                           # streak broken

        new_node = _calc_node(sessions)

        conn.execute(
            "UPDATE user_progress "
            "SET sessions_completed = ?, streak_days = ?, last_session_date = ?, "
            "current_node = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE user_id = ?",
            (sessions, streak, today, new_node, user_id),
        )
        conn.commit()

    return success_response(
        {"current_node": new_node, "sessions_completed": sessions, "streak_days": streak}
    )
