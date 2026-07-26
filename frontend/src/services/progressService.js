import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/** Returns today's date as a YYYY-MM-DD string (local time).
 *  Using local time so "today" matches the user's calendar day, not UTC —
 *  a user doing a session at 11 pm in UTC+1 should not see their streak reset
 *  because the UTC clock has already ticked to the next day.
 */
function today() {
  return new Date().toLocaleDateString('en-CA');
}

/** Returns yesterday's date as a YYYY-MM-DD string (local time). */
function yesterday() {
  return new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
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
    return { current_node: 0, sessions_completed: 0, streak_days: 0, last_checkin_session: 0 };
  }

  const snap = await getDoc(doc(db, 'user_progress', uid));
  if (!snap.exists()) {
    return { current_node: 0, sessions_completed: 0, streak_days: 0, last_checkin_session: 0 };
  }
  return { last_checkin_session: 0, ...snap.data() };
}

/**
 * Mark that a check-in assessment has been completed at the current session count.
 * Prevents the check-in banner from re-appearing until the next 7-session interval.
 */
export async function recordCheckin() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const ref  = doc(db, 'user_progress', uid);
  const snap = await getDoc(ref);
  const sessions = snap.exists() ? (snap.data().sessions_completed ?? 0) : 0;
  if (snap.exists()) {
    await updateDoc(ref, { last_checkin_session: sessions });
  } else {
    await setDoc(ref, { last_checkin_session: sessions, current_node: 0, sessions_completed: 0, streak_days: 0 });
  }
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

// ── Offline session queue ─────────────────────────────────────────────────────
// When a session completes without connectivity, we queue it in AsyncStorage
// and flush it the next time the app is online.

const OFFLINE_QUEUE_KEY = 'eloqua_offline_session_queue';

/**
 * Persist a pending session completion to AsyncStorage so it survives app restarts.
 * Called when completeSession() throws a network error.
 */
async function queueOfflineSession() {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    // Store just the timestamp — we re-run completeSession() on flush, which
    // reads the user's current Firestore state and applies the right increment.
    queue.push({ queued_at: new Date().toISOString() });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[Progress] Failed to queue offline session:', e?.message);
  }
}

/**
 * Flush any queued offline session completions to Firestore.
 * Call this from a NetInfo online listener (e.g. in AppNavigator).
 * Runs silently — never throws to the caller.
 */
export async function flushOfflineSessions() {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (!queue.length) return;

    // Clear the queue first so a mid-flush crash doesn't double-count on next run.
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);

    for (const _pending of queue) {
      // Each entry runs a fresh completeSession() which handles streak/node logic.
      // If multiple sessions were queued (unlikely), each increments correctly.
      await completeSession().catch(e =>
        console.warn('[Progress] Offline flush partial failure:', e?.message)
      );
    }
    console.log('[Progress] Flushed', queue.length, 'offline session(s)');
  } catch (e) {
    console.warn('[Progress] Offline flush failed:', e?.message);
  }
}

/**
 * Complete a session with automatic offline fallback.
 *
 * On network success: behaves exactly like completeSession().
 * On network failure: queues the session in AsyncStorage and returns an
 * optimistic result based on the last known progress so the UI can still
 * navigate to StreakCelebration without blocking the user.
 *
 * @returns {Promise<{current_node, sessions_completed, streak_days, offline?: true}>}
 */
export async function tryCompleteSession() {
  try {
    return await completeSession();
  } catch (e) {
    const isNetworkError = (
      e?.message?.includes('network') ||
      e?.message?.includes('Network') ||
      e?.message?.includes('fetch') ||
      e?.message?.includes('FirebaseError') ||
      e?.code === 'unavailable'
    );

    if (!isNetworkError) throw e; // rethrow auth errors etc.

    console.warn('[Progress] Session complete offline — queuing for later flush');
    await queueOfflineSession();

    // Return optimistic progress so the celebration screen still shows.
    // Fetch last known progress from Firestore cache (may still work offline).
    try {
      const cached    = await fetchProgress();
      const todayStr  = today();

      // Apply the same streak logic as completeSession() so the optimistic
      // value matches what the server will compute when the session flushes.
      // Without this, a user who already trained today would see streak +1
      // optimistically even though completeSession() would hold it steady.
      let streak = cached.streak_days;
      if (cached.last_session_date === todayStr) {
        // Same calendar day — streak stays; no double-count.
      } else if (cached.last_session_date === yesterday()) {
        streak += 1;
      } else {
        // Gap of more than one day — streak resets.
        streak = 1;
      }

      return {
        current_node:       Math.min(TOTAL_NODES - 1, cached.current_node + 1),
        sessions_completed: cached.sessions_completed + 1,
        streak_days:        streak,
        offline:            true,
      };
    } catch {
      return { current_node: 1, sessions_completed: 1, streak_days: 1, offline: true };
    }
  }
}
