import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// ── Eloqua analytics helpers ────────────────────────────────────────────────
//
// All functions are fire-and-forget.  They never throw, never await a result,
// and never block the caller — the user experience is unchanged whether a
// write succeeds or silently fails.
//
// Collections written:
//   users/{uid}/funnel_events  — onboarding milestones
//   users/{uid}/session_logs   — training session outcomes (complete or abandoned)
//   users/{uid}/usage_events   — feature usage (speech enhancement, etc.)

function uid() {
  return auth.currentUser?.uid ?? null;
}

// Log an onboarding funnel step.
// event: 'signup_completed' | 'about_you_completed' | 'assessment_baseline_started'
//      | 'assessment_baseline_completed' | 'home_first_visit'
export function logFunnelEvent(event) {
  const u = uid();
  if (!u) return;
  addDoc(collection(db, 'users', u, 'funnel_events'), {
    event,
    ts: serverTimestamp(),
  }).catch(() => {});
}

// Log a training session outcome.
// For completed sessions:
//   { started_at, completed_at, duration_s, node_index, completed: true,
//     exercise_scores, tiers_at_start }
// For abandoned sessions:
//   { started_at, abandoned_at, duration_s, node_index, completed: false,
//     abandoned_at_exercise_index, abandoned_at_exercise_type,
//     exercise_scores_partial }
export function logSessionEvent(data) {
  const u = uid();
  if (!u) return;
  addDoc(collection(db, 'users', u, 'session_logs'), {
    ...data,
    ts: serverTimestamp(),
  }).catch(() => {});
}

// Log a feature usage event.
// For speech enhancement:
//   { event: 'speech_enhance_completed', duration_ms }
//   { event: 'speech_enhance_failed', reason }
export function logUsageEvent(data) {
  const u = uid();
  if (!u) return;
  addDoc(collection(db, 'users', u, 'usage_events'), {
    ...data,
    ts: serverTimestamp(),
  }).catch(() => {});
}
