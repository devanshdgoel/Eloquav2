# Eloqua — Vocal Training System

*Last updated: 2026-05-25 (v1 analysis + v2 critical fixes)*

---

## V1 — System Architecture

### 1. The Training Roadmap (20 Nodes)

The HomeScreen renders a sine-wave SVG roadmap of 20 nodes. Each node tap routes to a specific screen type:

| Node | Screen | Purpose |
|------|--------|---------|
| **Node 0** | `AssessmentScreen` (type: `baseline`) | First-ever voice baseline |
| **Nodes 7, 14** | `AssessmentScreen` (type: `checkin`) **if** checkinDue, else `VocalTrainingSession` | Level gates |
| **All others** | `VocalTrainingSessionScreen` | Regular training |

**checkinDue logic:** `(currentNode - lastCheckinSession) >= LEVELS_EVERY` where `LEVELS_EVERY = 7`. After every 7 sessions since the last check-in, the next tap routes to a check-in instead.

Progress (`current_node`) advances by 1 on every `completeSession()` call, capped at node 19. The streak counter tracks consecutive daily sessions from `streak_days` in Firestore. `StreakCelebration` fires after each session completes.

---

### 2. Baseline Assessment

**File:** `frontend/src/screens/AssessmentScreen.js`  
**Route:** `Assessment` with `{ type: 'baseline' }` params

Three tasks run back-to-back automatically:

#### Task 1 — Sustained Vowel (`sustained_a`)
- User holds "aaah" — auto-stops on silence after they've spoken
- Silence detection: needs `SPEAK_THRESHOLD=0.25` for `MIN_SPEAK_FRAMES=3` frames to register as "has spoken"; then `SILENCE_THRESHOLD=0.15` for `SILENCE_FRAMES≈22 frames` (≈1.8s) triggers stop
- Hard cap at `maxS=12s`

#### Task 2 — Reading (`reading`)
- Fixed passage displayed; manual stop enabled after `minS=15s`; hard cap `maxS=90s`

#### Task 3 — Free Speech (`free_speech`)
- Conversational prompt; manual stop after `minS=10s`; hard cap `maxS=60s`

Each task's audio is POSTed to `/api/analyze-voice`. After all three complete:
- `computeComposite()` averages the three tasks' scores into `{ voice_power, expression, fluency }`
- `pickFocus()` identifies the weakest score dimension — becomes the user's named focus area
- If `isBaseline=true`, reading + free_speech recordings go to `/api/voice/clone` (ElevenLabs voice clone)
- On "Start My Journey": scores → `/api/save-assessment` → `/api/complete-session`

**V2 addition:** After baseline completes, `setTiersFromAssessment(composite)` initialises difficulty tiers based on voice scores (see §5).

---

### 3. Voice Measurement — How Scores Are Computed

**File:** `backend/services/voice_analysis_service.py`  
**Endpoint:** `POST /api/analyze-voice`

Every audio file goes through two parallel pipelines:

#### librosa pipeline (always runs):
- 13 MFCCs (timbral fingerprint — stored but not scored directly)
- RMS loudness in dBFS
- Pause detection via `librosa.effects.split()` — gaps ≥150ms counted as pauses
- `speech_rate_wpm` = word count from transcript ÷ net speech time × 60

#### Parselmouth/Praat pipeline (if installed):
- F0 mean, SD, range (pitch tracking 75–500 Hz)
- Intensity mean (dBFS equivalent)
- HNR (quality gate: if HNR < 5dB, jitter/shimmer marked unreliable)
- CPP (Cepstral Peak Prominence — sensitive early PD marker, stored only)
- Jitter % and shimmer % (stored as relative-trend-only markers)

#### The Three Scores (0–100 integers):

| Score | Source | Mapping |
|-------|---------|---------|
| **Voice Power** | Praat `intensity_mean_db` | Linear: 45dB→0, 75dB→100 |
| **Expression** | Praat `f0_sd_hz` | Linear: 0Hz SD→0, 50Hz SD→100 |
| **Fluency** | `speech_rate_wpm` + `pauses_per_min` | Bell curve: optimal 130 WPM; 60% WPM + 40% pause rate |

Scores are calibrated against PD clinical literature. They measure performance *relative to functional speech targets* — not relative to healthy controls. Cross-user comparison is invalid. Numbers only mean something as trends for the same user on the same device.

---

### 4. Regular Training Sessions

**File:** `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js`

Every non-gate node runs an 8-exercise fixed sequence:

```
1. Breathing           — warm-up
2. Sustained Phonation — voice quality + stamina  
3. Pitch Glides        — prosody range
4. Loudness Drills     — projection, clarity
5. MidpointScreen      — halfway celebration/rest
6. Breathing           — mid-session reset
7. Tailored Exercise   — weakest area, chosen automatically
8. Functional Speech   — real-world phrase practice
```

An orange progress bar fills as exercises complete. Long-press the bottom-right corner (2s) to skip (dev tool).

#### Exercise Mechanics:

**Breathing** — Timed breathing prompts. No recording, no scoring. Neural reset.

**Sustained Phonation** — User holds "ahhh" while a live volume meter gives feedback. Score = seconds held ÷ tier target. `bestScore` tracked across 3 rounds.

**Pitch Glides** — WebView + Web Audio API autocorrelation. 4–6 hoops alternate high/low target pitch. Hold pitch in zone for `HOLD_MS` to clear a hoop.

**Loudness Drills** — Flash-card phrases appear; speak loud enough within the timer to "whack" the jellyfish. Misses retry the same round.

**MidpointScreen** — Congratulatory interstitial. Auto-advances.

**Tailored Exercise** — `TailoredExercise.js` picks the exercise with the **lowest** current tier and runs it at that difficulty.

**Functional Speech** — Sentence reading practice with TTS demo. User reads each item aloud after hearing it.

---

### 5. The Difficulty System (Tiers 1–5)

**File:** `frontend/src/services/difficultyService.js`  
**Firestore path:** `user_progress/{uid}.difficulty_tiers`

```json
{ "phonation": 1, "loudness": 1, "pitchGlides": 1, "speech": 1 }
```

#### Exercise Tier Configs:

| Exercise | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|----------|--------|--------|--------|--------|--------|
| **Phonation** | 4s @ 40% vol | 5s @ 45% | 7s @ 50% | 9s @ 55% | 12s @ 60% |
| **Loudness** | 5-word, 4s, 45% | 8-word, 5s, 50% | 10-word, 6s, 55% | 15-word, 7.5s, 60% | 20-word, 9s, 65% |
| **PitchGlides** | ±20Hz, 4 hoops | ±30Hz | ±40Hz | ±50Hz | ±60Hz, 6 hoops |
| **FunctionalSpeech** | 1 word + short phrases | Medium phrases | Multi-clause | Complex functional | Rapid natural speech |

#### Tier Adjustment Logic (V2 — per-dimension):

Each exercise tier is driven by the voice score dimension most relevant to that exercise:

| Exercise | Driving Score |
|----------|--------------|
| `phonation` | `voice_power` |
| `loudness` | `voice_power` |
| `pitchGlides` | `expression` |
| `speech` | `fluency` |

If a dimension's delta at check-in exceeds ±5 points, only the exercises driven by that dimension change tier. This means a user can progress in pitch while staying at tier 1 in loudness if their voice_power scores are still low.

#### Tier Initialisation from Assessment (V2):

After baseline, tiers are set from composite scores rather than all defaulting to 1:
```
Score < 20  → tier 1
Score 20–38 → tier 2
Score 38–55 → tier 3
Score 55–70 → tier 4
Score ≥ 70  → tier 5
```

---

### 6. Progress Check-Ins (Level Gates at Nodes 7 and 14)

**File:** `frontend/src/screens/CheckinScreen.js`

Six sequential phases:

1. **Loading** — Fetch difficulty tiers + personal sentence from AsyncStorage
2. **Setup** *(first check-in only)* — User enters their "personal sentence" (saved permanently)
3. **Pre-recording** — User reads personal sentence → audio → `/api/analyze-voice` → `preScores`
4. **Mini session** — 4 exercises: Breathing → Sustained Phonation → Pitch Glides → Functional Speech (each at current difficulty tier)
5. **Post-recording** — Same sentence again → `postScores`
6. **Comparison** — Score arcs before/after. Tier change badge. "Finish" fires `adjustDifficultyAfterCheckin` + `completeSession`

The tier change badge is computed **inline** in the comparison phase so it displays immediately (not after Finish is tapped). Actual Firestore write happens on "Finish".

---

### 7. Data Flow Summary

```
User completes baseline assessment
  → voice scores computed (Praat + librosa)
  → setTiersFromAssessment() initialises difficulty_tiers based on scores [V2]
  → baseline scores saved to users/{uid}/assessments/baseline

User completes regular session (nodes 1–6, 8–13, 15–19)
  → each exercise calls onComplete(score) [V2]
  → VocalTrainingSessionScreen collects scores → saveSessionExerciseScores() [V2]
  → completeSession() advances current_node + updates streak
  → StreakCelebration shown

User taps check-in node (7 or 14)
  → CheckinScreen: pre-record → mini exercises → post-record
  → adjustDifficultyAfterCheckin() updates per-exercise tiers based on dimension deltas [V2]
  → assessment scores saved to users/{uid}/check_ins/{auto_id}
  → completeSession() advances node
```

---

## V1 — Gap Analysis

### 🔴 Critical (Fixed in V2)

1. **Assessment → Tier linkage missing** — All users started at tier 1 regardless of baseline scores. *Fixed in V2: `setTiersFromAssessment()` maps scores to tiers after baseline.*

2. **Tier adjustment was blunt and global** — One average delta moved all 4 tiers up/down together. *Fixed in V2: per-exercise tier adjustment using `TIER_SCORE_MAP`.*

3. **No per-exercise scoring** — Exercises called `onComplete()` with no data. No way to know if the user struggled or excelled. *Fixed in V2: exercises pass a score (0–100) to `onComplete(score)`, collected and stored in Firestore.*

4. **ProgressScreen had no content** — Screen existed but rendered nothing. *Resolved prior to V2: full progress screen with sparklines, milestones, stat cards, and `/api/progress-data` integration.*

### 🟡 Functional but Fragile

5. **Firestore security rules in test mode** — Any user with project ID can read/write all documents. *Must be locked down before public launch.*

6. **Render cold starts (~30–60s)** — Backend on free tier spins down after 15 min idle. Analysing phase hangs. *Mitigation: add `/health` wake-ping on app launch.*

7. **ElevenLabs voice cloning capped at ~10 slots** — Free/starter tier. Cloning fails silently beyond cap. *Needs quota management before scaling.*

8. **PitchGlides WebView pitch detection — Android uncertain** — Tested on iOS WebKit; Chromium WebView on Android may not initialise mic correctly. *Needs explicit Android testing.*

9. **Personal sentence is AsyncStorage-only** — If user reinstalls or switches device, sentence is lost, breaking longitudinal comparison validity. *Should sync to Firestore.*

### 🟠 UX / Design Gaps

10. **No exit guard in session** — Back gesture mid-session drops session credit silently. Needs "Are you sure?" confirmation.

11. **Check-in cannot be skipped** — User is hard-blocked until they complete it. No escape hatch.

12. **TailoredExercise picks lowest tier, not smartest** — When all tiers equal, defaults to first key alphabetically. Should weight by baseline focus area.

13. **Breathing has no progression** — No tier config; never gets harder regardless of user progress.

### 🟢 Known / Low Priority

14. `react-native-pitch-detector` still in `package.json` (unused). Remove with `npm uninstall react-native-pitch-detector`.
15. `voice_profile_service.py` exists — unclear if it's used or stale. Needs audit.
16. DDK (`/pa-ta-ka/`) task implemented in `voice_analysis_service.py` but no frontend. High clinical value.
17. Google Sign-In / Apple Sign-In deferred.

---

## V2 — Changes Made (2026-05-25)

### V2.1 — Assessment → Tier Initialisation

**Files:** `difficultyService.js`, `AssessmentScreen.js`

Added `tiersFromAssessmentScores(composite)` and `setTiersFromAssessment(compositeScores)` to `difficultyService.js`.

After baseline assessment completes (user taps "Start My Journey"), `setTiersFromAssessment(composite)` is called before navigating to Home. This maps:
- `voice_power` → `phonation` + `loudness` tiers
- `expression` → `pitchGlides` tier  
- `fluency` → `speech` tier

Threshold breakpoints: `<20 → tier 1`, `<38 → tier 2`, `<55 → tier 3`, `<70 → tier 4`, `≥70 → tier 5`.

*Rationale: PD patients typically score 15–45 on baseline voice_power and 10–35 on expression. Starting everyone at tier 1 wastes sessions for higher-functioning users.*

### V2.2 — Per-Dimension Tier Adjustment

**File:** `difficultyService.js`

`adjustDifficultyAfterCheckin` now uses `TIER_SCORE_MAP` to adjust each exercise tier independently based on the voice score dimension most relevant to that exercise. Each dimension delta is evaluated independently:

- `phonation` + `loudness` ← `voice_power` delta
- `pitchGlides` ← `expression` delta  
- `speech` ← `fluency` delta

The comparison screen displays per-exercise tier changes (4 individual pills instead of one combined badge), making the feedback more specific and motivating.

### V2.3 — Per-Exercise Scoring

**Files:** All exercise files, `VocalTrainingSessionScreen.js`, `difficultyService.js`

Each exercise now passes a score (0–100) to `onComplete(score)`:

| Exercise | Score Calculation |
|----------|-------------------|
| Sustained Phonation | `min(100, bestSeconds / targetSeconds × 100)` |
| Loudness Drills | `(TOTAL_ROUNDS / (TOTAL_ROUNDS + missCount)) × 100` |
| Pitch Glides | `100` (completes only when all hoops cleared) |
| Functional Speech | `100` (completes only when all items spoken) |

`VocalTrainingSessionScreen` collects per-exercise-type scores and calls `saveSessionExerciseScores()` at session end. Scores stored in Firestore at `user_progress/{uid}.recent_exercise_scores` (last 14 sessions).

*Future use: exercise scores can drive smarter per-exercise tier adjustments — if phonation scores are consistently ≥90%, automatically raise the phonation tier even between check-ins.*

---

## V2 — Re-evaluation: What Remains After Fixes

### Was a Gap, Is Now Resolved
- ✅ Assessment → tier initialisation (V2.1)
- ✅ Per-dimension tier adjustment (V2.2)
- ✅ Per-exercise score tracking (V2.3)
- ✅ ProgressScreen accessible and complete (built prior to V2, confirmed accessible via HomeScreen tab at line 453)

### Still Needs Work (Priority Order)

**Feature gaps:**

1. ~~**Exercise-score-driven tier adjustments between check-ins**~~ — **RESOLVED (V2 follow-up 2)**. See below.

2. ~~**Personal sentence not synced to Firestore**~~ — **RESOLVED (V2 follow-up)**. See below.

3. ~~**No session exit confirmation**~~ — **RESOLVED (V2 follow-up)**. See below.

4. **Breathing intentionally has no tier** — `BreathingExercise.js` is purely a calming reset between exercise blocks, not a skill-building exercise. It does not participate in the tier system. This is by design.

5. ~~**TailoredExercise tie-breaking is alphabetical**~~ — **RESOLVED (V2 follow-up 2)**. See below.

**Infrastructure (before public launch):**

6. **Firestore security rules open** — Must lock down before any real users access the app.

7. **Render cold-start wake ping missing** — Add `fetch(${API_BASE_URL}/health)` in `AuthContext` on auth state change, so the backend is warm before the user reaches the first recording screen.

8. **ElevenLabs voice cloning slots** — Free tier caps at ~10 slots. Needs quota management before scaling.

9. **Android PitchGlides untested** — WebView mic permission on Android Chromium WebView needs explicit testing.

**Minor cleanup (now all resolved):**

10. ~~`react-native-pitch-detector` still in `frontend/package.json`~~ — **RESOLVED (V2 follow-up)**. Removed from `package.json`.

11. ~~`tierChange` state in `CheckinScreen.js` orphaned~~ — **RESOLVED (V2 follow-up)**. State and setter removed.

---

## V2 Follow-up — Additional Fixes (2026-05-25, same day)

### Fix 4: Session exit confirmation
**Files:** `VocalTrainingSessionScreen.js`, `CheckinScreen.js`

Added `navigation.addListener('beforeRemove', ...)` in both screens. Behaviour:
- In `VocalTrainingSessionScreen`: fires whenever `!isDone` — catches both back gesture and the exercise `onExit` button. Once the session completes and navigates to `StreakCelebration`, the listener is removed so `navigation.replace` works unblocked.
- In `CheckinScreen`: fires only during `phase === 'mini'` — the phase where the user has already committed to a pre-recording and is in the middle of exercises. Earlier phases (setup, pre-recording) allow free back navigation.
- Both dialogs: "Leave session?" / "Your progress won't be saved if you leave now." with [Stay, Leave (destructive)].

### Fix 5: Personal sentence Firestore sync
**File:** `frontend/src/utils/storage.js`

`savePersonalSentence(sentence)` now writes to:
1. AsyncStorage (always, synchronous)
2. Firestore `user_progress/{uid}.personal_sentence` (best-effort, non-fatal)

`getPersonalSentence()` now:
1. Reads AsyncStorage first (instant, no network round-trip)
2. On cache miss, fetches from Firestore (reinstall / new device recovery)
3. Re-populates AsyncStorage from the Firestore value for future fast reads

This ensures the personal sentence survives app reinstalls and device switches. The longitudinal voice comparison (same sentence every check-in) remains valid across the user's lifetime.

### Fix 6: `tierChange` state cleanup
**File:** `CheckinScreen.js`

Removed `const [tierChange, setTierChange] = useState(null)` and the `if (adj) setTierChange(adj.direction)` call in `handleFinish`. These were left over from the V1 single-badge system and were never referenced after the comparison phase was updated to per-exercise tier pills.

### Fix 7: `react-native-pitch-detector` package removal
**File:** `frontend/package.json`

Removed `"react-native-pitch-detector": "^0.1.6"`. The package was replaced by WebView-based autocorrelation in a prior session; the dependency entry was never cleaned up.

---

## V2 Follow-up 2 — Between-session nudge + TailoredExercise tie-breaking (2026-05-25)

### Fix 8: Exercise-score-driven tier nudges between check-ins
**Files:** `frontend/src/services/difficultyService.js`, `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js`

**How it works:**
- New function `nudgeTiersFromRecentScores()` in `difficultyService.js` runs on every session start.
- Reads `user_progress/{uid}` once (same doc that holds tiers and recent_exercise_scores).
- For each of the 4 scored exercises, looks at the last 3 sessions where that exercise has a score:
  - avg ≥ 85 → bump tier +1 (user is finding it too easy)
  - avg ≤ 40 → drop tier -1 (user is struggling)
  - Otherwise → no change
  - Requires ≥ 3 data points for that exercise; skipped if fewer exist
- If any tier changed, writes back to Firestore in one `updateDoc` call.
- Returns `{ tiers, focusKey }` so `VocalTrainingSessionScreen` can set both in one async call.
- `VocalTrainingSessionScreen` now calls this instead of `fetchDifficultyTiers()`.

**Threshold rationale:**
- 85% = user is nailing the exercise consistently across 3 sessions → difficulty is too low, level up
- 40% = user is failing regularly → difficulty is too high, step down
- 3-session window prevents a single unusually good/bad session from changing the tier

**Two complementary adjustment mechanisms now active:**
- Check-in adjustment: voice score dimension deltas (before/after mini session) → per-dimension tier change
- Between-session nudge: actual exercise performance scores → per-exercise tier change
These are independent and can both fire (e.g. a check-in might raise pitchGlides tier, and if the user then scores 85%+ for 3 sessions, it bumps again automatically).

### Fix 9: TailoredExercise tie-breaking via baseline focus
**Files:** `frontend/src/services/difficultyService.js`, `frontend/src/screens/AssessmentScreen.js`, `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js`, `frontend/src/screens/vocaltraining/exercises/TailoredExercise.js`

**Problem:** When all 4 exercise tiers are equal (most common early in the user's journey), TailoredExercise would always select `phonation` (alphabetically first in Object.keys). This ignores the user's known baseline weakness.

**How it works:**
1. **Baseline assessment** (`AssessmentScreen.finishAssessment()`): the voice score dimension that scored lowest (`focus.key`: `voice_power`/`expression`/`fluency`) is mapped to an exercise key and stored in Firestore as `user_progress/{uid}.baseline_focus_key`:
   ```
   voice_power → 'phonation'
   expression  → 'pitchGlides'
   fluency     → 'speech'
   ```
   Written in the same `updateDoc` call as `difficulty_tiers` (via `setTiersFromAssessment(composite, exerciseFocusKey)`).

2. **Session start** (`VocalTrainingSessionScreen`): `nudgeTiersFromRecentScores()` returns both `tiers` and `focusKey` from the same Firestore read. `focusKey` stored in React state.

3. **TailoredExercise selection** (`findWeakestKey(tiers, focusKey)`):
   - Finds the minimum tier value across all 4 exercises
   - If only one exercise is at that minimum → use it (no tie)
   - If multiple exercises tie → prefer `focusKey` if it's in the tied set
   - Final fallback (no focusKey or focusKey not in tied set) → `'phonation'`

**Breathing intentionally excluded:** BreathingExercise is a calming reset, not a skill exercise. It has no tier and does not appear in the TailoredExercise selection.

---

## Key Files Reference

```
frontend/src/
  services/
    difficultyService.js     — tier management (fetchDifficultyTiers, setTiersFromAssessment,
                                adjustDifficultyAfterCheckin, saveSessionExerciseScores)
  screens/
    AssessmentScreen.js      — baseline + checkin assessment (3 tasks + voice cloning)
    CheckinScreen.js         — progress check-in (6 phases + per-dimension tier display)
    ProgressScreen.js        — voice score trends, milestones, session stats
    vocaltraining/
      VocalTrainingSessionScreen.js   — 8-exercise session runner + score collection
      exercises/
        BreathingExercise.js
        SustainedPhonationExercise.js — score = bestSeconds/targetSeconds
        PitchGlidesExercise.js        — WebView pitch detection, score=100 on completion
        LoudnessDrillsExercise.js     — score penalised by miss count
        FunctionalSpeechExercise.js   — score=100 on completion
        TailoredExercise.js           — picks weakest-tier exercise
        MidpointScreen.js

backend/
  api/
    analysis_routes.py       — POST /api/analyze-voice, GET /api/voice-history
    assessment_routes.py     — POST /api/save-assessment, /api/complete-session, /api/progress-data
  services/
    voice_analysis_service.py — Praat + librosa scoring pipeline
```

---

## V3 — Changes Made (2026-05-30)

### V3.1 — Auth Guards on All Backend Routes

**Files:** All route files under `backend/api/`; `frontend/src/utils/authHeaders.js` (new)

All analysis, assessment, voice, and speech routes now require a valid Firebase ID token. Previously, endpoints such as `/api/analyze-voice`, `/api/save-assessment`, and `/api/process-audio` were unauthenticated — any caller with the URL could trigger Whisper, GPT-4o, and ElevenLabs API spend.

**Backend change:** The `get_current_user` dependency (`backend/utils/auth_dep.py`) is now applied to every route in:
- `analysis_routes.py`
- `assessment_routes.py`
- `voice_routes.py`
- `speech_routes.py`

`user_id` form parameters have been removed from all request bodies. The backend now derives the user's UID exclusively from `current_user['uid']` — the result of `firebase_admin.auth.verify_id_token(token)`. Requests without a valid token receive `HTTP 401 Unauthorized`.

**Frontend change:** New utility `frontend/src/utils/authHeaders.js` exports `getAuthHeaders()`:

```js
export async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}
```

All screens that call backend endpoints (`SpeechEnhancementScreen`, `AssessmentScreen`, `CheckinScreen`, `FunctionalSpeechExercise`, `SettingsScreen`) now use `getAuthHeaders()` and include the `Authorization: Bearer <token>` header on every request.

---

### V3.2 — Dead Backend Files Deleted

**Files deleted:**
- `backend/api/auth_routes.py`
- `backend/api/progress_routes.py`
- `backend/database.py`

These files were legacy code from the pre-Firebase architecture (SQLite + PyJWT). They were not referenced by any current route and were never called by the frontend. Removing them eliminates dead import paths and reduces confusion about the active authentication model.

---

### V3.3 — Password Reset

**Files:** `frontend/src/services/authService.js`, `frontend/src/screens/onboarding/SignInScreen.js`

`sendPasswordResetEmail(email)` from Firebase Auth is now exported from `authService.js`. A "Forgot password?" link has been added below the sign-in form in `SignInScreen.js`. When tapped, it prompts the user for their email address via an `Alert.prompt` and calls `sendPasswordResetEmail`. Firebase delivers a reset link to the provided address. Success and failure states surface as alerts.

---

### V3.4 — Account Deletion

**Files:** `backend/api/assessment_routes.py` (new endpoint); `frontend/src/screens/SettingsScreen.js`

**New endpoint:** `DELETE /api/account`

Requires `Authorization: Bearer <token>`. On a verified request, the backend performs the following in sequence:

1. Deletes the Firestore document `user_progress/{uid}`
2. Deletes all documents in `users/{uid}/voice_sessions`, `users/{uid}/assessments`, `users/{uid}/check_ins`
3. Calls the ElevenLabs API to delete the user's cloned voice (if `voice_id` is set)
4. Calls `firebase_admin.auth.delete_user(uid)` to remove the Firebase Auth account

This is a hard delete — there is no recovery path.

**Frontend:** `SettingsScreen.handleDeleteAccount` shows a two-step confirmation `Alert`. On confirmation, it calls `DELETE /api/account` with the auth token, waits for a `200` response, then calls `signOut()` to clear local state and return to the Splash screen. If the backend call fails, the user is shown an error and their account is not deleted.

---

### V3.5 — Cold Start Health Check

**Files:** `frontend/src/context/AuthContext.js`, `frontend/src/navigation/AppNavigator.js`

On every auth state change (sign-in or app foreground), `AuthContext` fires a `GET /api/health` request to the backend:

```js
useEffect(() => {
  if (isSignedIn) {
    fetch(`${API_BASE_URL}/api/health`, { signal: AbortSignal.timeout(10000) })
      .catch(() => {}); // Non-fatal: app continues regardless
  }
}, [isSignedIn]);
```

The ping has a 10-second timeout and is fully non-fatal — a failure does not block navigation or show an error to the user. Its sole purpose is to wake the Render free-tier instance so it is warm before the user reaches a recording screen.

`AppNavigator` shows a "Connecting to server…" inline spinner (not a blocking modal) while the ping is in flight, then removes it once the ping resolves or times out. The user can navigate freely during the ping.

---

### V3.6 — Three Onboarding Explainer Screens (built, not yet wired in)

**New files (ready as backup — not currently in the navigation stack):**
- `frontend/src/screens/onboarding/WhatIsEloquaScreen.js`
- `frontend/src/screens/onboarding/HowItWorksScreen.js`
- `frontend/src/screens/onboarding/VoiceCloningExplainerScreen.js`

These screens are complete and polished but are **not currently registered in `AppNavigator.js`**. The live onboarding flow goes directly `SignUp → Personalise` as before.

**To activate before App Store submission:**
1. Import all three in `AppNavigator.js` and add `<Stack.Screen>` entries.
2. Change `SignUpScreen` line 52: `navigation.replace('Personalise')` → `navigation.replace('WhatIsEloqua')`.
3. Update the navigator comment to reflect the new flow.

**Intended navigation order when activated:**
```
Splash → SignUp → WhatIsEloqua → HowItWorks → VoiceCloningExplainer → Personalise → ...
```

**Screen purposes:**

| Screen | Content |
|---|---|
| `WhatIsEloquaScreen` | Parkinson's context, LSVT foundation, single CTA to HowItWorks. Skip link goes directly to Personalise. |
| `HowItWorksScreen` | Three-step card list: Train → Speak Enhanced → Track Progress. Skip link goes directly to Personalise. |
| `VoiceCloningExplainerScreen` | Privacy-first explanation of why voice samples are collected, ElevenLabs storage details, delete controls. No skip link — user must tap "I understand" to continue. Required for App Store review plausibility. |

---

## V3 — Re-evaluation: What Remains After Fixes

### Was a Gap, Is Now Resolved

- ✅ Auth guards on all backend routes — resolved in V3.1
- ✅ Password reset — resolved in V3.3
- ✅ Account deletion — resolved in V3.4
- ✅ Cold start health check (wake ping) — resolved in V3.5
- ✅ Onboarding explainer screens for App Store review — resolved in V3.6

### Still Needs Work (Priority Order)

**Infrastructure (must do before public launch):**

6. **Firestore security rules open** — Rules are still in test mode. Must be locked down via the Firebase console before any real users access the app. This cannot be resolved in code alone — it requires a manual deployment of rules from the Firebase console. Suggested rules:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       match /user_progress/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

7. **ElevenLabs voice cloning slots** — Free tier caps at ~10 concurrent slots. Needs quota management before scaling beyond a test cohort.

8. **Android PitchGlides untested** — WebView mic permission on Android Chromium WebView needs explicit device testing.

**Features (post-launch candidates):**

9. **Streaming TTS** — ElevenLabs streaming API would reduce perceived playback latency from ~4 s to near-instant.

10. **Fine-tuned dysarthric ASR** — Whisper degrades on dysarthric speech. A model fine-tuned on the TORGO dataset would improve accuracy for PD and stroke users.

11. **Push notifications / daily reminders** — Not yet implemented. High engagement value for a daily training app.

12. **Apple Sign-In / Google Sign-In** — Both still show "Coming soon" alerts.

13. **Android Play Store** — EAS Android build configured but store listing not started.
