import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// The total number of training sessions in the programme.
// This constant is imported by HomeScreen to size the roadmap, so any
// change here automatically resizes the visual map.
export const TOTAL_NODES = 20;

/**
 * Map sessions completed to a roadmap node index.
 *
 * The model is one session per node: completing session N unlocks node N.
 * Index 0 is the starting node (no sessions yet) and TOTAL_NODES - 1
 * is the final node.
 */
function calcNode(sessionsCompleted) {
  return Math.min(TOTAL_NODES - 1, sessionsCompleted);
}

/** Returns today's date as a YYYY-MM-DD string (UTC). */
function today() {
  return new Date().toISOString().split('T')[0];
}

/** Returns yesterday's date as a YYYY-MM-DD string (UTC). */
function yesterday() {
  return new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
}

/**
 * Fetch the current user's roadmap progress from Firestore.
 *
 * Returns a default object (node 0, zero sessions, zero streak) for users
 * who have no progress document yet, so callers never need to handle null.
 *
 * @returns {Promise<{current_node: number, sessions_completed: number, streak_days: number}>}
 */
export async function fetchProgress() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return { current_node: 0, sessions_completed: 0, streak_days: 0 };
  }

  const snap = await getDoc(doc(db, 'user_progress', uid));
  if (!snap.exists()) {
    return { current_node: 0, sessions_completed: 0, streak_days: 0 };
  }
  return snap.data();
}

/**
 * Record a completed training session and persist the updated progress.
 *
 * Streak logic:
 *   - Same calendar day as the last session: streak unchanged (no double-counting).
 *   - Consecutive day: streak incremented by 1.
 *   - Gap of more than one day: streak resets to 1.
 *
 * @returns {Promise<{current_node: number, sessions_completed: number, streak_days: number}>}
 */
export async function completeSession() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User is not authenticated.');

  const ref      = doc(db, 'user_progress', uid);
  const snap     = await getDoc(ref);
  const todayStr = today();

  // First-ever session for this user.
  if (!snap.exists()) {
    const data = {
      current_node:       calcNode(1),
      sessions_completed: 1,
      streak_days:        1,
      last_session_date:  todayStr,
    };
    await setDoc(ref, data);
    return data;
  }

  const prev     = snap.data();
  const sessions = prev.sessions_completed + 1;
  let   streak   = prev.streak_days;

  if (prev.last_session_date === todayStr) {
    // Already logged a session today — do not increment the streak again.
  } else if (prev.last_session_date === yesterday()) {
    streak += 1;
  } else {
    // Streak broken by a gap of more than one day.
    streak = 1;
  }

  const updated = {
    current_node:       calcNode(sessions),
    sessions_completed: sessions,
    streak_days:        streak,
    last_session_date:  todayStr,
  };
  await updateDoc(ref, updated);
  return updated;
}
