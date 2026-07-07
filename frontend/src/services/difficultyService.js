/**
 * difficultyService — per-exercise difficulty tier management.
 *
 * Each exercise type has a tier (1–5) stored in Firestore at
 * user_progress/{uid}.difficulty_tiers.
 *
 * V2 changes (2026-05-25):
 *   - Tiers are now initialised from baseline assessment scores via
 *     setTiersFromAssessment(), so users start at the right difficulty.
 *   - Tier adjustment after check-in is now per-dimension: each exercise
 *     tier is driven by the voice score most relevant to it, not a
 *     single average across all three dimensions.
 *   - Per-session exercise performance is saved for future analysis.
 */
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export const EXERCISE_KEYS = ['phonation', 'loudness', 'pitchGlides', 'speech'];
export const MIN_TIER = 1;
export const MAX_TIER = 5;

/** Default tiers for first-time users (all start at 1). */
export const DEFAULT_TIERS = {
  phonation:   1,
  loudness:    1,
  pitchGlides: 1,
  speech:      1,
};

/**
 * Maps each exercise tier to the voice score dimension that best reflects
 * performance in that exercise.
 *
 *   phonation   → voice_power (sustained loudness / breath support)
 *   loudness    → voice_power (projection)
 *   pitchGlides → expression  (F0 variability / pitch range)
 *   speech      → fluency     (speech rate + pause frequency)
 */
const TIER_SCORE_MAP = {
  phonation:   'voice_power',
  loudness:    'voice_power',
  pitchGlides: 'expression',
  speech:      'fluency',
};

/**
 * Score thresholds for tier initialisation.
 * Based on typical PD patient baseline ranges:
 *   voice_power: 15–45  (intensity deficit is the primary PD speech symptom)
 *   expression:  10–40  (monopitch / reduced F0 range is very common)
 *   fluency:     20–55  (slowed speech + frequent pauses)
 *
 * Thresholds are intentionally conservative so users start where they can
 * succeed and feel motivated, then progress upward.
 */
const TIER_THRESHOLDS = [20, 38, 55, 70]; // < each → tier 1,2,3,4; ≥ last → 5

function _scoreToTier(score) {
  if (score == null || !Number.isFinite(score)) return 1;
  if (score < TIER_THRESHOLDS[0]) return 1;
  if (score < TIER_THRESHOLDS[1]) return 2;
  if (score < TIER_THRESHOLDS[2]) return 3;
  if (score < TIER_THRESHOLDS[3]) return 4;
  return 5;
}

function _clampTier(t) {
  return Math.min(MAX_TIER, Math.max(MIN_TIER, Math.round(t)));
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the user's current difficulty tiers from Firestore.
 * Returns DEFAULT_TIERS if none are stored yet (safe fallback, never throws).
 *
 * @returns {Promise<{ phonation, loudness, pitchGlides, speech }>}
 */
export async function fetchDifficultyTiers() {
  const uid = auth.currentUser?.uid;
  if (!uid) return { ...DEFAULT_TIERS };
  try {
    const snap = await getDoc(doc(db, 'user_progress', uid));
    if (!snap.exists()) return { ...DEFAULT_TIERS };
    const stored = snap.data().difficulty_tiers;
    if (!stored) return { ...DEFAULT_TIERS };
    // Merge so any new exercise keys added in future get their defaults.
    return { ...DEFAULT_TIERS, ...stored };
  } catch {
    return { ...DEFAULT_TIERS };
  }
}

// ── Initialise from assessment ────────────────────────────────────────────────

/**
 * Compute starting difficulty tiers from a baseline voice assessment composite.
 *
 * voice_power  → phonation + loudness tiers
 * expression   → pitchGlides tier
 * fluency      → speech tier
 *
 * @param {{ voice_power, expression, fluency }} composite - scores 0–100
 * @returns {{ phonation, loudness, pitchGlides, speech }}
 */
export function tiersFromAssessmentScores({ voice_power, expression, fluency } = {}) {
  return {
    phonation:   _scoreToTier(voice_power),
    loudness:    _scoreToTier(voice_power),
    pitchGlides: _scoreToTier(expression),
    speech:      _scoreToTier(fluency),
  };
}

/**
 * Compute tiers from baseline scores and write them to Firestore.
 * Called once after the baseline assessment completes. Safe to re-call
 * (idempotent update).
 *
 * @param {{ voice_power, expression, fluency }} compositeScores
 * @param {string|null} focusKey - Exercise key of the user's weakest area
 *   ('phonation' | 'pitchGlides' | 'speech' | null). Stored as
 *   baseline_focus_key and used by TailoredExercise for tie-breaking.
 * @returns {Promise<{ phonation, loudness, pitchGlides, speech }>}
 */
export async function setTiersFromAssessment(compositeScores, focusKey = null) {
  const uid = auth.currentUser?.uid;
  if (!uid || !compositeScores) return { ...DEFAULT_TIERS };

  const tiers = tiersFromAssessmentScores(compositeScores);

  // Build the update payload — include focusKey if provided
  const payload = { difficulty_tiers: tiers };
  if (focusKey) payload.baseline_focus_key = focusKey;

  try {
    const ref  = doc(db, 'user_progress', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, {
        ...payload,
        current_node:       0,
        sessions_completed: 0,
        streak_days:        0,
      });
    }
  } catch (err) {
    console.warn('[difficultyService] setTiersFromAssessment write failed:', err?.message);
  }

  return tiers;
}

// ── Check-in tier adjustment ───────────────────────────────────────────────────

/**
 * Adjust tiers after a Progress Check-in using per-dimension logic.
 *
 * Each exercise tier is driven by the voice score most relevant to it
 * (TIER_SCORE_MAP). If a dimension's delta exceeds ±5 points, only the
 * exercises driven by that dimension change tier — e.g. a user can level
 * up pitchGlides without changing phonation if expression improved but
 * voice_power did not.
 *
 * @param {{ voice_power, expression, fluency }} preScores  - before mini session
 * @param {{ voice_power, expression, fluency }} postScores - after mini session
 * @returns {Promise<{
 *   newTiers:    { phonation, loudness, pitchGlides, speech },
 *   direction:   'up' | 'down' | 'flat',   // overall summary
 *   avgDelta:    number,
 *   tierChanges: { phonation, loudness, pitchGlides, speech }  // per-exercise direction
 * } | null>}
 */
export async function adjustDifficultyAfterCheckin(preScores, postScores) {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  // Per-dimension deltas (null-safe: default to 50 if missing)
  const vpDelta = (postScores?.voice_power ?? 50) - (preScores?.voice_power ?? 50);
  const exDelta = (postScores?.expression  ?? 50) - (preScores?.expression  ?? 50);
  const flDelta = (postScores?.fluency     ?? 50) - (preScores?.fluency     ?? 50);

  const dimDeltas = {
    voice_power: vpDelta,
    expression:  exDelta,
    fluency:     flDelta,
  };

  const avgDelta = (vpDelta + exDelta + flDelta) / 3;
  const overallDirection =
    avgDelta > 5  ? 'up'   :
    avgDelta < -5 ? 'down' : 'flat';

  function adjustTier(currentTier, delta) {
    if (delta > 5)  return _clampTier(currentTier + 1);
    if (delta < -5) return _clampTier(currentTier - 1);
    return currentTier;
  }

  const current     = await fetchDifficultyTiers();
  const newTiers    = { ...current };
  const tierChanges = {};

  for (const key of EXERCISE_KEYS) {
    const drivingDim = TIER_SCORE_MAP[key];
    const delta      = dimDeltas[drivingDim] ?? 0;
    const adjusted   = adjustTier(current[key] ?? 1, delta);
    newTiers[key]    = adjusted;
    tierChanges[key] =
      adjusted > (current[key] ?? 1) ? 'up'   :
      adjusted < (current[key] ?? 1) ? 'down' : 'flat';
  }

  try {
    const ref  = doc(db, 'user_progress', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { difficulty_tiers: newTiers });
    } else {
      await setDoc(ref, {
        difficulty_tiers:   newTiers,
        current_node:       0,
        sessions_completed: 0,
        streak_days:        0,
      });
    }
  } catch (err) {
    console.warn('[difficultyService] adjustDifficultyAfterCheckin write failed:', err?.message);
  }

  return { newTiers, direction: overallDirection, avgDelta, tierChanges };
}

// ── Between-session tier nudge ────────────────────────────────────────────────

/**
 * Load the user's current difficulty tiers, apply automatic nudges based on
 * their recent session performance, and return the (possibly updated) tiers
 * plus their baseline focus key.
 *
 * Nudge rules (applied independently per exercise):
 *   • Needs ≥ 3 sessions with a score for that exercise in recent_exercise_scores
 *   • avg score ≥ 85 over those 3 sessions → bump tier +1  (content too easy)
 *   • avg score ≤ 40 over those 3 sessions → drop tier -1  (content too hard)
 *   • Otherwise: no change
 *
 * This runs at the start of every training session, so tiers are always current
 * before the first exercise loads — no need to wait for a formal check-in.
 *
 * @returns {Promise<{ tiers, focusKey: string|null } | null>}
 *   null only when not authenticated; never throws.
 */
export async function nudgeTiersFromRecentScores() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  try {
    const ref  = doc(db, 'user_progress', uid);
    const snap = await getDoc(ref);

    // No document yet — first-time user, return safe defaults
    if (!snap.exists()) {
      return { tiers: { ...DEFAULT_TIERS }, focusKey: null };
    }

    const data        = snap.data();
    const current     = { ...DEFAULT_TIERS, ...(data.difficulty_tiers ?? {}) };
    const history     = data.recent_exercise_scores ?? [];
    const focusKey    = data.baseline_focus_key ?? null;

    // Not enough history to nudge — return current tiers as-is
    if (history.length < 3) {
      return { tiers: current, focusKey };
    }

    const newTiers = { ...current };
    let   changed  = false;

    for (const key of EXERCISE_KEYS) {
      // Collect the last 3 entries that have a score for this exercise
      const recentScores = history
        .filter(entry => entry[key] != null && Number.isFinite(entry[key]))
        .slice(-3);

      if (recentScores.length < 3) continue; // fewer than 3 data points → skip

      const avg = recentScores.reduce((sum, e) => sum + e[key], 0) / recentScores.length;

      if (avg >= 85 && current[key] < MAX_TIER) {
        newTiers[key] = _clampTier(current[key] + 1);
        changed = true;
      } else if (avg <= 40 && current[key] > MIN_TIER) {
        newTiers[key] = _clampTier(current[key] - 1);
        changed = true;
      }
    }

    // Only write back if something actually changed
    if (changed) {
      await updateDoc(ref, { difficulty_tiers: newTiers });
    }

    return { tiers: newTiers, focusKey };
  } catch (err) {
    console.warn('[difficultyService] nudgeTiersFromRecentScores failed:', err?.message);
    // Safe fallback — still usable, just no nudge applied
    return { tiers: { ...DEFAULT_TIERS }, focusKey: null };
  }
}

// ── Progress Plan ─────────────────────────────────────────────────────────────

/**
 * Compute a personalised progress plan from baseline voice scores and MPT.
 *
 * Three milestone targets are generated:
 *   checkin1 → session 7  (35% of gap closed)
 *   checkin2 → session 14 (65% of gap closed)
 *   goal     → session 20 (100% of gap closed / programme end)
 *
 * The gap is measured from the user's baseline to clinically informed targets:
 *   composite score → 80 (upper-end of typical PD improvement range)
 *   MPT             → 15 s (lower bound of healthy adult range; achievable
 *                           with LSVT-style daily practice)
 *
 * @param {{ voice_power, expression, fluency }} baselineScores
 * @param {number|null} mptSeconds - best MPT from the baseline assessment
 * @returns {{ baseline, checkin1, checkin2, goal, created_at }}
 */
export function computeProgressPlan(baselineScores = {}, mptSeconds = null) {
  const SCORE_GOAL = 80;
  const MPT_GOAL   = 15;  // seconds
  const FRACTIONS  = [0.35, 0.65, 1.0];

  // Fall back to 5 s if MPT was not captured (e.g. backend unavailable at baseline)
  const baseMPT = (mptSeconds != null && mptSeconds > 0) ? mptSeconds : 5;

  // Build one milestone snapshot for a given gap-close fraction
  function milestone(frac) {
    const m = {
      mpt_seconds: Math.round((baseMPT + (MPT_GOAL - baseMPT) * frac) * 10) / 10,
    };
    for (const k of ['voice_power', 'expression', 'fluency']) {
      const base = baselineScores[k];
      m[k] = base != null ? Math.round(base + (SCORE_GOAL - base) * frac) : null;
    }
    return m;
  }

  const [checkin1, checkin2, goal] = FRACTIONS.map(milestone);

  return {
    baseline:   { ...baselineScores, mpt_seconds: baseMPT },
    checkin1,
    checkin2,
    goal,
    created_at: new Date().toISOString().split('T')[0],
  };
}

/**
 * Persist the progress plan to user_progress/{uid}.progress_plan.
 * Called once after the baseline assessment. Safe to re-call (idempotent).
 */
export async function storeProgressPlan(plan) {
  const uid = auth.currentUser?.uid;
  if (!uid || !plan) return;
  try {
    const ref  = doc(db, 'user_progress', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { progress_plan: plan });
    } else {
      await setDoc(ref, {
        progress_plan:      plan,
        difficulty_tiers:   { ...DEFAULT_TIERS },
        current_node:       0,
        sessions_completed: 0,
        streak_days:        0,
      });
    }
  } catch (err) {
    console.warn('[difficultyService] storeProgressPlan write failed:', err?.message);
  }
}

/**
 * Fetch the stored progress plan from Firestore.
 * Returns null for pre-baseline users or when Firestore is unreachable.
 */
export async function fetchProgressPlan() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'user_progress', uid));
    if (!snap.exists()) return null;
    return snap.data().progress_plan ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns which check-in number this session represents (1 or 2+).
 * Drives which milestone targets are shown in the comparison screen.
 *
 * Returns 1 if the user has never completed a check-in (last_checkin_session == 0).
 * Returns 2 for their second check-in onwards.
 */
export async function fetchCheckinNumber() {
  const uid = auth.currentUser?.uid;
  if (!uid) return 1;
  try {
    const snap = await getDoc(doc(db, 'user_progress', uid));
    if (!snap.exists()) return 1;
    const last = snap.data().last_checkin_session ?? 0;
    return last > 0 ? 2 : 1;
  } catch {
    return 1;
  }
}

// ── Exercise score persistence ────────────────────────────────────────────────

/**
 * Persist per-exercise scores from one training session.
 *
 * Scores are stored as an array in user_progress/{uid}.recent_exercise_scores
 * (capped at the last 14 sessions). These serve as a longitudinal record
 * of per-exercise performance and can be used in future to drive tier
 * adjustments between check-ins.
 *
 * @param {{ phonation?, loudness?, pitchGlides?, speech? }} scores - 0–100 each
 */
export async function saveSessionExerciseScores(scores) {
  const uid = auth.currentUser?.uid;
  if (!uid || !scores || Object.keys(scores).length === 0) return;

  const today = new Date().toISOString().split('T')[0];
  const entry = { date: today, ...scores };

  try {
    const ref  = doc(db, 'user_progress', uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const existing = snap.data().recent_exercise_scores ?? [];
      // Keep last 14 sessions (two full weeks)
      const updated  = [...existing, entry].slice(-14);
      await updateDoc(ref, { recent_exercise_scores: updated });
    } else {
      await setDoc(ref, {
        difficulty_tiers:       { ...DEFAULT_TIERS },
        recent_exercise_scores: [entry],
        current_node:           0,
        sessions_completed:     0,
        streak_days:            0,
      });
    }
  } catch (err) {
    console.warn('[difficultyService] saveSessionExerciseScores write failed:', err?.message);
  }
}
