# Eloqua — Session Handoff Document
**Date:** 25 May 2026  
**Session type:** Continuation — V2 vocal training critical fixes + documentation

---

## Summary of this session's changes (2026-05-25)

### Created: `VOCAL_TRAINING.md`
Full documentation of the vocal training system — how sessions work, exercise mechanics, scoring, tier system, assessment flow, data flow, gap analysis (V1), and all V2 changes made.

### Created: `ERRORS.md` (existing, unchanged)
Already existed from prior session.

### V2 Fix 1: Assessment → Tier Initialisation
**Problem:** All users started every exercise at tier 1 regardless of their baseline voice assessment scores. Higher-functioning users wasted sessions on trivially easy content.

**Files changed:**
- `frontend/src/services/difficultyService.js` — added `tiersFromAssessmentScores()`, `setTiersFromAssessment()`
- `frontend/src/screens/AssessmentScreen.js` — calls `setTiersFromAssessment(composite)` in `finishAssessment()` after baseline

**How it works:** After baseline completes, composite scores map to starting tiers:
- `voice_power` → `phonation` + `loudness` tiers
- `expression` → `pitchGlides` tier
- `fluency` → `speech` tier

Score thresholds: `<20→1`, `<38→2`, `<55→3`, `<70→4`, `≥70→5`

### V2 Fix 2: Per-Dimension Tier Adjustment at Check-Ins
**Problem:** `adjustDifficultyAfterCheckin` computed one average delta across all three voice scores and moved all 4 exercise tiers uniformly up/down. A user whose expression improved but voice_power didn't would still have their loudness tier raised incorrectly.

**Files changed:**
- `frontend/src/services/difficultyService.js` — rewrote `adjustDifficultyAfterCheckin` with `TIER_SCORE_MAP`
- `frontend/src/screens/CheckinScreen.js` — comparison phase now shows per-exercise tier change pills instead of a single badge

**How it works:** `TIER_SCORE_MAP` defines which voice score dimension drives each exercise tier:
```
phonation   → voice_power
loudness    → voice_power
pitchGlides → expression
speech      → fluency
```
Each dimension is evaluated independently. Only tiers driven by dimensions that changed > ±5 points adjust.

### V2 Fix 3: Per-Exercise Scoring During Sessions
**Problem:** All exercises called `onComplete()` with no performance data. Session history had no record of how well the user actually did in each exercise.

**Files changed:**
- `frontend/src/screens/vocaltraining/exercises/SustainedPhonationExercise.js` — `onComplete(score)` where score = `min(100, bestSeconds/targetSeconds × 100)`
- `frontend/src/screens/vocaltraining/exercises/LoudnessDrillsExercise.js` — tracks miss count, `onComplete(score)` where score penalises misses
- `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js` — `onComplete(100)` (can only complete when all hoops cleared)
- `frontend/src/screens/vocaltraining/exercises/FunctionalSpeechExercise.js` — `onComplete(100)` (can only complete when all items spoken)
- `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js` — collects scores in `exerciseScoresRef`, calls `saveSessionExerciseScores()` at session end
- `frontend/src/services/difficultyService.js` — added `saveSessionExerciseScores()`, stores last 14 sessions in Firestore at `user_progress/{uid}.recent_exercise_scores`

### V2 Finding: ProgressScreen is already complete
The ProgressScreen was built in a prior session and IS accessible (HomeScreen tab button at line 453 → `navigation.navigate('Progress')`). It shows: session progress ring, streak/session stats, voice score sparklines with deltas vs baseline, milestone badges. Connects to `/api/progress-data` backend endpoint. Not a gap.

---

## Summary of this session's changes (2026-05-25 — V2 follow-up)

### Fix 4: Session exit confirmation
**Problem:** Back gesture or `onExit` tap mid-session silently dropped session credit. The user could accidentally lose a completed session (no streak credit, no Firestore write).

**Files changed:**
- `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js` — added `navigation.addListener('beforeRemove', ...)` guard (fires for all phases where `!isDone`); `Alert` imported
- `frontend/src/screens/CheckinScreen.js` — same guard but fires only during `phase === 'mini'` (outside mini-exercise phase the user hasn't committed yet); `Alert` imported

**Behaviour:** "Leave session?" → ["Stay", "Leave (destructive)"]. Back navigation is intercepted before it resolves; pressing Stay cancels the navigation event.

### Fix 5: Personal sentence Firestore sync
**Problem:** `savePersonalSentence` / `getPersonalSentence` were AsyncStorage-only. After an app reinstall or device switch the personal sentence was lost, which breaks longitudinal voice comparison validity (pre/post recordings of the same sentence).

**File changed:** `frontend/src/utils/storage.js`

**How it works:**
- `savePersonalSentence(sentence)` writes to AsyncStorage (sync, always) + Firestore `user_progress/{uid}.personal_sentence` (best-effort, non-fatal)
- `getPersonalSentence()` reads AsyncStorage first (fast). If miss (reinstall/new device), falls back to Firestore, then re-populates AsyncStorage for future instant reads
- Firebase imports added to storage.js: `doc, getDoc, updateDoc, setDoc` from `firebase/firestore` + `auth, db` from `../config/firebase`

### Fix 6: `tierChange` state cleanup in CheckinScreen
**Problem:** After V2 tier pill redesign, the `tierChange` state (`useState(null)`) and `setTierChange(adj.direction)` call in `handleFinish` were orphaned — nothing in the render used them.

**File changed:** `frontend/src/screens/CheckinScreen.js` — removed `tierChange` state declaration and the `if (adj) setTierChange(...)` call. Comment updated to reflect V2 per-dimension logic.

### Fix 7: Remove `react-native-pitch-detector` from package.json
**Problem:** Package was still listed as a dependency even though WebView-based autocorrelation replaced it. Unnecessary dependency, never installed in Expo Go builds.

**File changed:** `frontend/package.json` — removed `"react-native-pitch-detector": "^0.1.6"` entry.

---

---

## Summary of this session's changes (2026-05-25 — V2 follow-up 2)

### Fix 8: Exercise-score-driven tier nudges between check-ins
New `nudgeTiersFromRecentScores()` in `difficultyService.js`. Runs on every session start. For each exercise, looks at the last 3 sessions with a score: avg ≥ 85 → tier +1, avg ≤ 40 → tier -1, otherwise no change (requires ≥ 3 data points). Returns `{ tiers, focusKey }` in one Firestore read. `VocalTrainingSessionScreen` now calls this instead of `fetchDifficultyTiers`.

**Files:** `difficultyService.js`, `VocalTrainingSessionScreen.js`

### Fix 9: TailoredExercise tie-breaking via baseline focus
`AssessmentScreen.finishAssessment()` now passes `exerciseFocusKey` to `setTiersFromAssessment()`, which writes it to Firestore as `baseline_focus_key`. `nudgeTiersFromRecentScores()` returns it in the same read. `VocalTrainingSessionScreen` passes it as `focusKey` prop to `TailoredExercise`. `findWeakestKey(tiers, focusKey)` now prefers the user's weakest baseline dimension when tiers are tied, before falling back to `phonation`.

**Files:** `difficultyService.js`, `AssessmentScreen.js`, `VocalTrainingSessionScreen.js`, `TailoredExercise.js`

### Clarification: Breathing has no tier (by design)
`BreathingExercise` is a calming reset between exercise blocks, not a skill exercise. It intentionally has no tier and no BREATHING_TIERS config. Removed from the gap list.

---

### Updated next steps (post V2 follow-up 2)

Items still open (ordered by impact):

1. **Deploy** — `cd frontend && eas update --branch main` to push all changes to Expo Go testers
2. **Test end-to-end:**
   - Baseline assessment → verify `difficulty_tiers` + `baseline_focus_key` in Firestore
   - 3 sessions with high phonation scores → verify phonation tier bumps automatically on 4th session start
   - TailoredExercise slot → confirm it selects the user's focus exercise when all tiers equal
   - Check-in → verify per-exercise ⬆/⬇ pills appear correctly
   - Back gesture mid-session → confirm "Leave session?" alert fires
   - Reinstall app → confirm personal sentence still loads from Firestore
3. **Firestore security rules** — Currently in test mode. Must lock down before any public launch.
4. **Render cold-start wake ping** — Add `fetch(${API_BASE_URL}/health)` in `AuthContext` on auth state resolved.
5. **ElevenLabs cloning quota check** — Verify slot availability before clone attempt; graceful fallback.
6. **Android PitchGlides WebView** — Untested. WebView mic permission on Android Chromium needs device testing.

---

**Previous session handoff follows:**

---

# Eloqua — Session Handoff Document (2026-05-24)
**Date:** 24 May 2026  
**Session type:** Continuation (context was compacted from a prior session)

---

## 1. What the app is

React Native + Expo (SDK 54, managed workflow) speech therapy app for Parkinson's/aphasia patients. FastAPI backend on Render. Firebase Auth + Firestore for auth and progress. Two main features:

- **Smart Speech** — record speech → GPT-4o clarity pipeline → ElevenLabs TTS playback with cloned voice
- **Vocal Training** — 20-node roadmap of exercises (breathing, phonation, pitch glides, loudness, functional speech), with baseline assessment, check-ins, and streak tracking

---

## 2. Services in use

| Service | Purpose | Cost | Status |
|---|---|---|---|
| Firebase Auth + Firestore | Auth, progress data, assessment scores | Free (Spark plan) | ✅ Working |
| Render | FastAPI backend hosting | Free (cold starts ~30–60 s after idle) | ✅ Working |
| OpenAI (GPT-4o) | Smart Speech clarity + coherence pipeline | Pay-per-use (~cents/session) | ✅ Working |
| ElevenLabs | TTS playback + voice cloning | Free tier (character cap) | ✅ Working |
| Expo EAS | OTA updates via `eas update` | Free | ✅ Working |

**Render cold start:** Free tier spins down after ~15 min inactivity. First request after idle takes 30–60 s. Upgrade to $7/mo to eliminate this.

**Firestore rules:** Currently in **test mode (open)**. Anyone with the project ID can read/write. Must be locked down before any public launch.

---

## 3. Changes made in this session

### 3.1 CheckinScreen — new feature

Progress check-in nodes sit at roadmap positions 7 and 14 (every `LEVELS_EVERY = 7` nodes). Previously these routed to `AssessmentScreen` with `type: 'checkin'`. Now they route to a dedicated `CheckinScreen`.

**Files changed:**

**`frontend/src/utils/storage.js`**
- Added `savePersonalSentence(sentence)` — persists to AsyncStorage key `eloqua_personal_sentence`
- Added `getPersonalSentence()` — returns string or null

**`frontend/src/screens/CheckinScreen.js`** ← new file
Five-phase flow:
1. **`setup`** (first check-in only) — TextInput: user enters a sentence they say every day. Saved permanently, reused every subsequent check-in.
2. **`pre`** — shows the personal sentence in a card. User taps to record it. Audio sent to `/api/analyze-voice` (task_type: `reading`) → scores stored as `preScores`.
3. **`mini`** — 4 exercises in sequence: Breathing → SustainedPhonation → PitchGlides → FunctionalSpeech. Same component pattern as VocalTrainingSessionScreen (orange progress bar, 2 s long-press skip zone).
4. **`post`** — same recording UI as pre. Scores stored as `postScores`.
5. **`comparison`** — before/after arc graphs for Voice Power, Expression, Fluency. Green delta labels. "Finish" → `completeSession()` → `StreakCelebration`.

Recording: `expo-av` HIGH_QUALITY, 80 ms metering interval, 3 s minimum, 20 s maximum.

**`frontend/src/navigation/AppNavigator.js`**
- Added `import CheckinScreen from '../screens/CheckinScreen'`
- Added `<Stack.Screen name="Checkin" component={CheckinScreen} />`

**`frontend/src/screens/HomeScreen.js`**
- Changed `handleNodePress` for check-in nodes from `navigation.navigate('Assessment', { type: 'checkin' })` → `navigation.navigate('Checkin', { nodeIndex: i })`

---

### 3.2 PitchGlidesExercise — fixed for Expo Go

**Root cause:** `import PitchDetector from 'react-native-pitch-detector'` is a native module. Expo Go crashes at import time — there is no way to catch it.

**Failed attempt — volume-based (rejected):**
Replaced pitch detection with `expo-av` dB metering. Louder → dolphin up, quieter → dolphin down. User correctly rejected this: "We already have a loudness exercise. I want a pitch one. It is necessary."

**Final solution — WebView + Web Audio API:**

`react-native-webview` is bundled in Expo Go and supports `getUserMedia` + `AudioContext`. A hidden `300×300` WebView sits at `top: -600, left: -600` (off-screen but fully initialised — 1×1 was unreliable on iOS). The WebView runs a range-limited autocorrelation pitch detector entirely in JS:

- `fftSize = 2048`, polled every 80 ms via `setInterval`
- Only checks periods for 70–600 Hz (human voice range) → ~557 lags × ~2048 samples ≈ 1.1M float ops per tick, well within mobile WebView capacity
- Finds first autocorrelation trough then peak-after-trough (prevents octave errors)
- Parabolic interpolation for sub-sample frequency accuracy
- Posts `{ pitch: Hz, vol: 0–1 }` to React Native via `window.ReactNativeWebView.postMessage()`

React Native `onMessage` handler:
- During `calibrating` (1.5 s): collects Hz samples → median becomes `basePitch`
- During `listening`: `level = (hz - basePitch) / 100`, clamped 0–1 → drives dolphin position
- 4 hoops alternate high/low target; holding in zone for 700 ms completes a hoop

**iOS specifics:**
- `baseUrl: 'https://eloqua-backend.onrender.com'` — WKWebView requires an HTTPS origin for `getUserMedia`. Sets the page origin without making a network request.
- `mediaCapturePermissionGrantType="grant"` — auto-grants mic without a browser-style popup (app already has mic permission from expo-av).

**Android specifics:**
- `onPermissionRequest={(e) => { e.nativeEvent.grant?.(e.nativeEvent.resources); }}` — auto-grants WebView mic on Android.

**Package installed:**
```
npx expo install react-native-webview
```
(Added to `package.json` as `react-native-webview` at the Expo SDK 54 compatible version.)

---

## 4. Known issues and unresolved items

### 4.1 Pitch Glides on iOS Expo Go — uncertain
WKWebView `getUserMedia` behaviour varies by iOS version and device. The `baseUrl` + `mediaCapturePermissionGrantType="grant"` combination is the best known approach for inline HTML. **If it doesn't work on a specific iOS device/version in Expo Go**, the identical code works without changes in an EAS Development Build. Test on Android first — it should work reliably there.

### 4.2 `react-native-pitch-detector` still in package.json
It's installed but no longer imported anywhere. Can be removed:
```
npm uninstall react-native-pitch-detector
```
No code changes needed — it was already removed from the import in PitchGlidesExercise.js.

### 4.3 Firestore security rules — open test mode
**This is a real security risk.** Currently any user with the Firebase project ID can read/write all data. Needs proper rules before any public release. Suggested rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4.4 Google Sign-In — deferred
Shows "Coming soon" alert. To enable:
1. Create an iOS OAuth client ID in Google Cloud Console
2. Set redirect URI to `https://auth.expo.io/@eloqua-team/eloqua2`
3. Add `googleIosClientId` to `app.config.js`

### 4.5 Apple Sign-In — deferred
Requires Apple Developer Program membership ($99/yr) and entitlement configuration in EAS build profile.

### 4.6 Render cold starts
First request after idle is slow. If this becomes a UX problem, upgrade Render to a paid instance or add a keep-alive ping (a cron job hitting `/health` every 10 min).

### 4.7 ElevenLabs free tier cap
Voice cloning + TTS together will hit the monthly character limit quickly under real usage. Monitor and upgrade to a paid plan before launch.

---

## 5. Architecture reference

### Navigation flow
```
Splash → SignIn → Home (returning users)
Splash → SignUp → Personalise → SetupPermissions → AboutYouIntro → SetupAboutYou → Home (new users)
```
Note: SetupVoice screen was removed. Voice cloning now happens inside AssessmentScreen after the baseline assessment completes.

### Roadmap nodes
- **Node 0:** Baseline assessment (AssessmentScreen, type: 'baseline') — only on first tap when sessions_completed === 0
- **Nodes 1–6, 8–13, 15–19:** VocalTrainingSessionScreen
- **Nodes 7, 14:** CheckinScreen (new)
- Progress tracked in Firestore via `progressService.js` → `/api/complete-session` (Admin SDK, bypasses Firestore security rules)

### Training session exercises (in order)
1. Breathing
2. Sustained Phonation
3. Pitch Glides ← WebView-based pitch detection
4. Loudness Drills
5. Midpoint screen
6. Breathing (reset)
7. Tailored Exercise
8. Functional Speech

### Check-in mini session exercises (in order)
1. Breathing
2. Sustained Phonation
3. Pitch Glides
4. Functional Speech

### Backend endpoints (FastAPI, `eloqua-backend.onrender.com`)
| Endpoint | Purpose |
|---|---|
| `POST /api/process-audio` | Transcribe → clarity → ElevenLabs TTS |
| `POST /api/analyze-voice` | Score a recording (voice_power, expression, fluency) via praat-parselmouth |
| `POST /api/voice/clone` | Clone user voice with ElevenLabs (called after baseline assessment) |
| `POST /api/complete-session` | Increment sessions, update streak (Admin SDK) |
| `POST /api/save-assessment` | Save assessment scores to Firestore |
| `GET /api/audio/{filename}` | Serve enhanced audio file (path traversal protected) |

### Key file locations
```
frontend/
  app.config.js              — Expo config, EAS project ID, env vars
  src/
    config/
      firebase.js            — Firebase init with AsyncStorage persistence
      env.js                 — API_BASE_URL auto-detection
    context/AuthContext.js   — Firebase onAuthStateChanged
    navigation/AppNavigator.js
    screens/
      HomeScreen.js          — SVG sine-wave roadmap, 20 nodes
      AssessmentScreen.js    — Baseline + check-in assessment (3 tasks)
      CheckinScreen.js       — Progress check-in (new)
      SpeechEnhancementScreen.js
      vocaltraining/
        VocalTrainingSessionScreen.js
        exercises/
          BreathingExercise.js
          SustainedPhonationExercise.js
          PitchGlidesExercise.js  ← WebView pitch detection
          LoudnessDrillsExercise.js
          TailoredExercise.js
          FunctionalSpeechExercise.js
          MidpointScreen.js
    services/
      progressService.js     — Firestore progress: fetchProgress, completeSession
      authService.js         — Firebase Auth: registerWithEmail, loginWithEmail
    utils/storage.js         — AsyncStorage: onboarding flag, user profile, personal sentence

backend/
  main.py                    — FastAPI app, CORS, routers
  config.py                  — OPENAI_API_KEY, ELEVENLABS_API_KEY, etc.
  firebase_config.py         — Admin SDK init
  utils/auth_dep.py          — get_current_user dependency
  api/
    speech_routes.py         — /api/process-audio, /api/analyze-voice
    voice_routes.py          — /api/voice/clone
    audio_routes.py          — /api/audio/{filename}
  services/
    clarity_speech.py        — GPT-4o clarity pipeline (chunked + final pass)
    enhancement_service.py   — ElevenLabs TTS
    voice_cloning_service.py — ElevenLabs voice clone
    voice_analysis_service.py — praat-parselmouth scoring
```

---

## 6. Things that were broken and fixed (this + prior session)

| Bug | Fix |
|---|---|
| Expo Go 403 for testers | Created `eloqua-team` org on expo.dev; updated `app.config.js` with `owner: 'eloqua-team'`, `privacy: 'public'`, new `projectId` |
| Render deploy crash (exit code 1) | `voice_analysis_service.py` imported `librosa`/`numpy` which weren't in `requirements.txt`. Added `librosa>=0.10.0`, `numpy>=1.24.0`, `soundfile>=0.12.0` |
| Voice cloning silently broken | `voiceService.js` set `Content-Type: multipart/form-data` manually, stripping the multipart boundary. Removed the header entirely — `fetch` sets it correctly with boundary |
| ElevenLabs error parser crash | `response.json().get("detail", {}).get("message")` crashed when `detail` was a string. Added `isinstance(d, dict)` check |
| Firestore "Missing or insufficient permissions" | Client SDK subject to expired test-mode rules. Fixed by using backend Admin SDK via `/api/complete-session` |
| Speech enhancement: back button during recording | Hidden `{phase !== S.RECORDING && phase !== S.ENHANCING && (...)}` |
| Speech enhancement: "ENHANCED"/"YOUR WORDS" split | Simplified to always show `cleaned_transcript \|\| raw_transcript` |
| Cross-chunk sentence splitting | Added SENTENCE BOUNDARY RULE to chunked correction prompt; final-pass prompt re-joins sentences split at chunk boundaries |
| Pitch Glides crash in Expo Go | Replaced `react-native-pitch-detector` (native module) with WebView + Web Audio API autocorrelation |

---

## 7. Next steps (priority order)

### Immediate
1. **Run `eas update --branch main`** — pushes all V2 changes to Expo Go testers
2. **Test assessment → tier initialisation** — complete a baseline, verify `difficulty_tiers` in Firestore reflect the scores (not all 1s)
3. **Test check-in tier pills** — complete a check-in, verify comparison screen shows per-exercise ⬆/⬇ pills for exercises whose driving dimension changed
4. **Test exercise scores in Firestore** — complete a session, verify `recent_exercise_scores` array is updated in `user_progress/{uid}`
5. **Remove unused package:** `npm uninstall react-native-pitch-detector` in `/frontend`

### Before any public launch
6. **Firestore security rules** — lock down in Firebase console (see Section 4.3)
7. **ElevenLabs plan** — check monthly character usage, upgrade if needed
8. **Render plan** — add `/health` wake-ping in AuthContext on sign-in to warm up the backend before first recording screen

### Features still to build
9. **Personal sentence → Firestore sync** — currently AsyncStorage only. Reinstall/device switch loses the sentence. Add Firestore write in `savePersonalSentence()`.
10. **Exit confirmation in sessions** — Back gesture silently drops session credit. Add `Alert.alert('Leave session?', ...)` in `VocalTrainingSessionScreen` and `CheckinScreen`.
11. **Breathing tier progression** — `BreathingExercise.js` has no tier config. Add `BREATHING_TIERS` (box breath hold time / ratio) and wire up `tier` prop from `VocalTrainingSessionScreen`.
12. **Exercise-score-driven tier nudges** — `saveSessionExerciseScores` stores data (V2.3) but doesn't yet auto-adjust tiers between check-ins. Future: if phonation score ≥90% for 3+ consecutive sessions, auto-bump the phonation tier.
13. **Google Sign-In** — needs iOS OAuth client ID and redirect URI (see Section 4.4)
14. **Apple Sign-In** — needs Apple Developer account
15. **EAS Dev Build** — needed for: (a) iOS PitchGlides if WebView approach fails, (b) any future native module, (c) production iOS distribution

---

## 8. How to deploy after code changes

```bash
# Push OTA update to Expo Go testers (no build required)
cd frontend
eas update --branch main

# Backend deploys automatically on Render when you push to the connected git branch
git push origin main
```

**ElevenLabs voice ID:** Stored per-user in Firestore after baseline assessment. If a user's voice clone fails (non-fatal), Smart Speech falls back to a default ElevenLabs voice.

**Environment variables needed on Render:**
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `FIREBASE_ADMIN_KEY` (or path to service account JSON)
- `ALLOWED_ORIGINS` (frontend origins for CORS)

---

## Session 4 — V3 (2026-05-30): Auth, Account Management, Onboarding

### What Was Built / Fixed

#### V3.1 — Auth Guards on All Backend Routes
All backend routes (analysis, assessment, voice, speech) now require a Firebase ID token via `Authorization: Bearer <token>`. Previously, speech and analysis endpoints were open to unauthenticated callers, creating unbounded API cost exposure. `user_id` form params were removed from all request bodies — the backend now derives UID exclusively from the verified token via `get_current_user`. A new `getAuthHeaders()` utility (`frontend/src/utils/authHeaders.js`) centralises token retrieval across all frontend screens.

#### V3.2 — Dead Backend Files Deleted
Three legacy files from the pre-Firebase (SQLite + PyJWT) architecture were deleted:
- `backend/api/auth_routes.py`
- `backend/api/progress_routes.py`
- `backend/database.py`

These were never called by the current frontend and were creating misleading import targets.

#### V3.3 — Password Reset
`sendPasswordResetEmail(email)` wired into `authService.js`. A "Forgot password?" link added to `SignInScreen.js` — prompts user for email via `Alert.prompt`, calls Firebase Auth password reset, surfaces result as an alert.

#### V3.4 — Account Deletion
New `DELETE /api/account` endpoint in `assessment_routes.py`. On a verified auth token, the backend deletes: Firestore progress doc, voice sessions, assessments, check-ins, ElevenLabs voice clone, and finally the Firebase Auth account. Frontend `SettingsScreen.handleDeleteAccount` shows a two-step confirmation, calls the endpoint with the auth token, then calls `signOut()`. Hard delete with no recovery path.

#### V3.5 — Cold Start Health Check
`AuthContext.js` fires a non-fatal `GET /api/health` ping (10-second timeout) on auth state change, warming up the Render free-tier instance before the user reaches a recording screen. `AppNavigator` shows a "Connecting to server…" inline spinner while the ping is in flight — non-blocking, user can navigate freely.

#### V3.6 — Three Onboarding Explainer Screens (backup)
`WhatIsEloquaScreen`, `HowItWorksScreen`, and `VoiceCloningExplainerScreen` were created this session. They are registered in `AppNavigator` but are **not in the active onboarding path** — kept as backup for a future "About Eloqua" entry in Settings. See Session 5 for the final onboarding flow.

---

### New Files Created

| File | Purpose |
|---|---|
| `frontend/src/utils/authHeaders.js` | `getAuthHeaders()` — centralised Firebase token header builder |
| `frontend/src/screens/onboarding/WhatIsEloquaScreen.js` | Onboarding explainer: what Eloqua is |
| `frontend/src/screens/onboarding/HowItWorksScreen.js` | Onboarding explainer: 3-step overview |
| `frontend/src/screens/onboarding/VoiceCloningExplainerScreen.js` | Onboarding explainer: voice data privacy |
| `SPEECH_ENHANCEMENT.md` | Full documentation for the Speech Enhancement feature and chunked pipeline |

### Files Deleted

| File | Reason |
|---|---|
| `backend/api/auth_routes.py` | Legacy JWT/SQLite auth — replaced by Firebase Auth |
| `backend/api/progress_routes.py` | Legacy SQLite progress — replaced by Firestore + Admin SDK |
| `backend/database.py` | SQLite ORM layer — no longer used |

### Files Modified (Key Changes)

| File | Change |
|---|---|
| `backend/api/speech_routes.py` | Added `get_current_user` dependency to all routes; removed `user_id` form param |
| `backend/api/analysis_routes.py` | Added `get_current_user` dependency; derive uid from token |
| `backend/api/assessment_routes.py` | Added `get_current_user` dependency; added `DELETE /api/account` endpoint |
| `backend/api/voice_routes.py` | Added `get_current_user` dependency to clone, status, and delete routes |
| `frontend/src/context/AuthContext.js` | Added health-check ping on auth state change |
| `frontend/src/navigation/AppNavigator.js` | Registered 3 new onboarding screens; added connecting spinner |
| `frontend/src/services/authService.js` | Added `sendPasswordResetEmail` export |
| `frontend/src/screens/onboarding/SignInScreen.js` | Added "Forgot password?" link |
| `frontend/src/screens/SettingsScreen.js` | Added `handleDeleteAccount` with two-step confirmation + API call |

---

### Still Pending

The following items remain open after Session 4:

1. **Firestore security rules deployment** — Rules are still in open test mode. Must be manually deployed from the Firebase console before any public launch. Code-ready rules are documented in `VOCAL_TRAINING.md § V3 Still Needs Work`.

2. **Apple EAS credentials** — iOS distribution build profile (`ios-preview`) is configured in `eas.json` but Apple Developer team credentials (Apple ID, team ID, provisioning profile) have not been configured in the EAS dashboard.

3. **App Store assets** — 1024×1024 icon, 6.7" iPhone screenshots (min 3, target 5–6), app description, subtitle, keywords, Privacy Policy URL, and content rating questionnaire are not yet prepared.

4. **Push notifications** — No push notification infrastructure. Daily training reminders are a high-engagement feature not yet implemented.

5. **iOS privacy manifest** — Apple requires a `PrivacyInfo.xcprivacy` file declaring API usage (microphone, network access) for App Store submissions from Xcode 15 onwards. Not yet added to the EAS build config.

6. **Streaming TTS** — ElevenLabs streaming API integration to reduce playback latency.

7. **Fine-tuned dysarthric ASR** — SONIVA available as toggle, but a TORGO-trained Whisper fine-tune would meaningfully improve transcription quality for dysarthric users.

---

### How to Deploy After Session 4

```bash
# OTA update to Expo Go testers
cd frontend
eas update --branch main

# Backend auto-deploys on Render when pushed to connected git branch
git push origin main
```

Backend environment variables on Render (unchanged from prior sessions):
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `FIREBASE_ADMIN_KEY`
- `ALLOWED_ORIGINS`

---

## Session 5 — V3 (2026-05-30): Error Handling, Push Notifications, Onboarding Redesign

### What Was Built / Fixed

#### V5.1 — Comprehensive Error Handling

All major failure paths that previously failed silently now surface a user-visible Alert with retry. See `ERROR_HANDLING.md` for the full failure-mode table.

**Frontend:**
- **`AuthContext.js`** — 15-second timeout on `onAuthStateChanged`. If Firebase never resolves (network offline, token stuck), `authError: true` is set and `isLoading` clears. `SplashScreen` shows a "Trouble restoring your session" banner + sign-in buttons instead of spinning forever.
- **`AssessmentScreen.finishAssessment()`** — wraps save-assessment and complete-session calls in try/catch; shows Alert with "Try again / Continue anyway" on failure. Removed all `.catch(() => {})` silent suppression.
- **`CheckinScreen.handleFinish()`** — same pattern: Alert with retry on save failure instead of silently resetting to Home.
- **`ProgressScreen`** — added `error` state + `loadData()` retry function; shows "Could not load your progress" + orange Retry button on fetch failure.
- **`HomeScreen`** — added `progressError` state; shows tappable orange retry banner if `fetchProgress()` fails.
- **`FunctionalSpeechExercise`** — checks `res.ok` before parsing JSON; a 401/500 now skips the exercise cleanly instead of attempting to parse an empty/error response body and silently advancing.
- **`PitchGlidesExercise`** — added `onError` / `onHttpError` handlers to the WebView; if mic access fails to initialise, a full-screen "Microphone unavailable" overlay appears with a Skip button instead of leaving the user on a blank screen.
- **`AppNavigator`** — wrapped `<NavigationContainer>` in the existing `<ErrorBoundary>` component.

**Backend:**
- **`main.py`** — global `exception_handler(Exception)` returns consistent `{ status: "error", message: "..." }` JSON on any unhandled 500 and logs the full traceback.
- **`firebase_config.py`** — Firebase Admin SDK init wrapped in try/except; raises `RuntimeError` with a clear message on startup failure rather than crashing with an opaque import error.
- **`utils/auth_dep.py`** — distinguishes expired (401) vs revoked (403) tokens; adds `WWW-Authenticate` header on 401 per RFC 6750; logs auth failures.

---

#### V5.2 — Push Notifications

New `frontend/src/services/notificationService.js` implements three notification types using `expo-notifications`:

| Type | Schedule | Copy |
|---|---|---|
| Daily reminder | Repeating, user-set time (default 10:00) | "Time for your Eloqua session, [name]." |
| Re-engagement nudge | One-time, fires 3 days after last session | "Your voice practice is here whenever you're ready." |
| Weekly summary | Repeating, Mondays 18:00 | "Check how you did this week →" |

**Key design decisions (Parkinson's users):**
- Calm/warm copy — no streak threats, no guilt, no "you broke your streak"
- User sets their own preferred time (not app-imposed)
- Contextual opt-in: permission requested only when the user first enables a notification toggle in Settings
- Caregiver/carer notifications deferred to V2

**Session completion hooks:** `onSessionComplete()` (resets the 3-day re-engagement clock) is now called after every completion path — `VocalTrainingSessionScreen.finishSession()`, `CheckinScreen.handleFinish()`, `AssessmentScreen.finishAssessment()`.

**`SettingsScreen`** — new **NOTIFICATIONS** section above TRAINING with:
- Daily reminder toggle
- Reminder time picker (6:00 AM – 10:00 PM, 30-min intervals, bottom-sheet modal)
- Re-engagement nudge toggle
- Weekly summary toggle

**`app.config.js`** — added `expo-notifications` plugin entry + iOS `NSUserNotificationsUsageDescription`.

**Package installed:** `expo-notifications` (via `npx expo install`).

---

#### V5.3 — Onboarding Redesign

**Problem:** The old flow had 3 consecutive empty "intro to next screen" screens (`PersonaliseScreen`, vague `SetupPermissionsScreen`, `AboutYouIntroScreen`) adding 3 pointless taps. `SetupVoiceScreen` was completely unreachable — `SetupAboutYouScreen` called `setOnboardingComplete()` and navigated directly to Home, bypassing voice setup entirely.

**Benchmark research:** Duolingo, Headspace, Calm, Woebot/Wysa all converge on the same pattern: ≤3 screens before first value, contextual permissions (not upfront), no standalone tutorial sequences, profile setup minimal. Only collect what the app immediately needs.

**New active flow:**
```
SignUp → SetupPermissions → SetupAboutYou → SetupVoice → Home
```

**Changes per screen:**

| Screen | Change |
|---|---|
| `SignUpScreen` | Routes to `SetupPermissions` after register (was `Personalise`) |
| `SignInScreen` | Routes to `SetupPermissions` if onboarding incomplete (was `Personalise`) |
| `SetupPermissionsScreen` | **Fully rewritten.** Explains exactly why mic is needed (voice exercises + speech enhancement) with two card items before the OS dialog. Design matches the rest of the onboarding system. Routes to `SetupAboutYou`. |
| `SetupAboutYouScreen` | Name pre-filled from `auth.currentUser.displayName` (no double-entry). Phone field removed. 3-dot progress indicator removed (vestigial). Navigates to `SetupVoice` instead of Home. No longer calls `setOnboardingComplete()`. |
| `SetupVoiceScreen` | Now reachable. `setOnboardingComplete()` called here — the true end of onboarding. Skip button still works (navigates to Home, marks onboarding complete). |

**Backup screens (not in active flow):**
`WhatIsEloquaScreen`, `HowItWorksScreen`, `VoiceCloningExplainerScreen` remain registered in `AppNavigator` for a future "About Eloqua" entry in Settings, or for App Store review if needed. Their skip links and forward buttons are wired to consistent targets so they can be inserted into the flow at any time.

**Dead screens (files kept, not imported):**
`PersonaliseScreen.js`, `AboutYouIntroScreen.js` — no longer imported by `AppNavigator`. Files retained to avoid any merge conflicts with other branches.

---

### New Files Created (Session 5)

| File | Purpose |
|---|---|
| `frontend/src/services/notificationService.js` | Daily, re-engagement, and weekly push notifications |
| `ERROR_HANDLING.md` | Full failure-mode reference table with fallback routes |

### Files Modified (Key Changes, Session 5)

| File | Change |
|---|---|
| `backend/main.py` | Global exception handler → consistent 500 JSON |
| `backend/firebase_config.py` | Admin SDK init in try/except; RuntimeError on failure |
| `backend/utils/auth_dep.py` | Expired vs revoked token distinction; WWW-Authenticate header |
| `frontend/src/context/AuthContext.js` | 15s auth timeout; `authError` state |
| `frontend/src/screens/splash/SplashScreen.js` | `authError` timeout banner |
| `frontend/src/screens/AssessmentScreen.js` | Retry Alert on save failure; `onSessionComplete()` call |
| `frontend/src/screens/CheckinScreen.js` | Retry Alert on handleFinish failure; `onSessionComplete()` call |
| `frontend/src/screens/ProgressScreen.js` | Error state + retry button |
| `frontend/src/screens/HomeScreen.js` | `progressError` state + retry banner |
| `frontend/src/screens/vocaltraining/exercises/FunctionalSpeechExercise.js` | `res.ok` guard before JSON parse |
| `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js` | WebView `onError`/`onHttpError` → mic-unavailable overlay |
| `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js` | `onSessionComplete()` call in `finishSession()` |
| `frontend/src/navigation/AppNavigator.js` | `ErrorBoundary` wrapper; 3 backup screens registered; flow comment updated |
| `frontend/src/screens/SettingsScreen.js` | Full NOTIFICATIONS section with toggles + time picker modal |
| `frontend/app.config.js` | `expo-notifications` plugin + iOS usage string |
| `frontend/package.json` / `package-lock.json` | `expo-notifications` added |
| `frontend/src/screens/onboarding/SignUpScreen.js` | Routes to `SetupPermissions` |
| `frontend/src/screens/onboarding/SignInScreen.js` | Routes to `SetupPermissions` if not onboarded |
| `frontend/src/screens/onboarding/SetupPermissionsScreen.js` | Fully rewritten; contextual mic explanation |
| `frontend/src/screens/onboarding/SetupAboutYouScreen.js` | Name pre-filled; phone removed; routes to `SetupVoice` |
| `frontend/src/screens/onboarding/WhatIsEloquaScreen.js` | Skip link wired to `VoiceCloningExplainer` |
| `frontend/src/screens/onboarding/HowItWorksScreen.js` | Skip link wired to `VoiceCloningExplainer` |
| `frontend/src/screens/onboarding/VoiceCloningExplainerScreen.js` | Button wired to `SetupPermissions` |

---

### Updated Navigation Flow (Post Session 5)

```
New users:
  Splash → SignUp → SetupPermissions → SetupAboutYou → SetupVoice → Home

Returning users (onboarding complete):
  Splash → SignIn → Opening → Home

Returning users (onboarding incomplete):
  Splash → SignIn → SetupPermissions (restarts onboarding)

Backup screens (not in active flow — registered for future use):
  WhatIsEloqua → HowItWorks → VoiceCloningExplainer → SetupPermissions
```

---

### Still Pending (Post Session 5)

1. **Firestore security rules** — Still in open test mode. Must lock down in Firebase console before any public launch.

2. **Apple EAS credentials** — iOS distribution profile configured but Apple Developer credentials not yet set up in EAS dashboard.

3. **App Store assets** — Icon (1024×1024), screenshots, description, Privacy Policy URL, content rating not yet prepared.

4. **iOS privacy manifest** — `PrivacyInfo.xcprivacy` not yet added for App Store submissions.

5. **401 auto-refresh on frontend** — Expired Firebase tokens generate 401s from the backend. Currently these surface as errors to the user. The correct fix is to intercept 401 responses in `getAuthHeaders()`, call `user.getIdToken(true)` to force-refresh, and retry the original request once. Documented in `ERROR_HANDLING.md`.

6. **NetInfo offline detection** — `@react-native-community/netinfo` not installed. Screens currently rely on fetch errors to surface offline state rather than proactive detection.

7. **SetupVoice duplicate voice clone** — If a user exits and re-enters the onboarding flow, `SetupVoiceScreen` may attempt to create a second ElevenLabs voice clone without checking if one already exists. Add a Firestore check for existing `voice_id` before calling `/api/voice/clone`.

8. **Streaming TTS** — ElevenLabs streaming API not yet integrated (reduces perceived playback latency).

9. **Caregiver notifications** — Deferred to V2.

10. **Adaptive notification timing** — ML-inferred optimal send time based on usage patterns. Deferred to V2.

---

### How to Deploy After Session 5

```bash
# OTA update to Expo Go testers (no build required for JS-only changes)
cd frontend
eas update --branch main

# Backend auto-deploys on Render when pushed to connected git branch
git push origin main
```

Backend environment variables on Render (unchanged):
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `FIREBASE_ADMIN_KEY`
- `ALLOWED_ORIGINS`

---

## Session 6 — Design System & Accessibility Pass (2026-06-05)

### Overview

Two-phase session:

1. **Font size enforcement (WCAG 2.1)** — All text below 16px raised to the accessibility minimum across all exercise and component screens.
2. **Global design system** — `theme/index.js` rewritten as the canonical single source of truth for every visual token, then applied globally across all 20+ screens.

---

### Phase 1: Font Size Fixes

All font sizes below 16px were raised to ≥ 16px. SC-scaled text (which could drop below threshold on small devices) was replaced with fixed sizes.

| File | Properties fixed |
|---|---|
| `BreathingExercise.js` | pillText 11→16, stepNum 14→16, stepBadge 30→32, instrText 15→16, motivational 15→17 |
| `SustainedPhonationExercise.js` | tag 11→16, subtitle 15→17, stepNum 12→16, scoreTagText 13→16, pillText 11→16, stepText 13→16, nextText 15→16, bestLabel 14→16, tapHint/goalHint 13→16, goalReached 14→16 |
| `DolphinVowelsExercise.js` | badge.text 12→16, vowel label 14→16, subHint 13→16 |
| `CantDoNow.js` | triggerText 14→16, body 15→17, skipSub 13→16, stayText 14→16 |
| `PitchGlidesExercise.js` | micErrorBody 15→17, micErrorBtnText 15→17 |
| `FunctionalSpeechExercise.js` | readyBtnText 15*SC→17, phaseHint 16*SC→16 |

---

### Phase 2: Design System (`theme/index.js`)

**`frontend/src/theme/index.js`** completely rewritten. Was a dead file with purple/unused colours. Now the canonical source for all visual tokens.

#### Palette (internal `_p`)
| Token | Value | Use |
|---|---|---|
| teal950 | `#0A1618` | Gradient end |
| teal900 | `#1C4047` | Primary dark bg |
| teal800 | `#243E44` | Session/assessment screens |
| teal700 | `#2D6974` | Cards/surfaces |
| teal600 | `#326F77` | Auth gradient start |
| teal500 | `#37767A` | App gradient start |
| teal400 | `#68B39F` | Mint teal (speech/onboarding) |
| teal300 | `#9FCFBD` | Light mint |
| teal200 | `#C3DECE` | Pale mint (accent labels) |
| teal100 | `#E0ECDE` | Lightest mint (form screens) |
| forest | `#1E3828` | Exercise score zone top |
| orange | `#FFA940` | **The one orange** — energy, streaks, CTA |
| green | `#48D28C` | Success, waveform bars |
| red | `#E05252` | Error, destructive |

#### Semantic `colors` export
- Backgrounds: `bgDark`, `bgDeep`, `bgSession`, `bgForest`, `bgLight`
- Surfaces: `surface` (#2D6974), `surfaceSubtle` (rgba white 7%), `surfaceMid` (translucent teal)
- Borders: `border` (mint @18%), `borderMid` (mint @25%), `borderLight` (white @18%)
- Text on dark: `textPrimary` (#FFF), `textSecondary` (white @60%), `textFaint` (white @38%)
- Text on light: `textDark`, `textDarkDim`, `textDarkFaint` (teal900 with opacity)
- Gradients: `darkApp`, `auth`, `lightForm`, `speech`, `session`, `instruction`, `ready`

#### Typography `type` export
All sizes ≥ 16px (WCAG 2.1 floor):

| Token | Size | Weight | Use |
|---|---|---|---|
| score | 128 | 900 | Score display, countdown |
| display | 56 | 800 | "THINK LOUD", exercise titles |
| h1 | 38 | 800 | Page titles |
| h2 | 32 | 800 | Screen headings |
| h3 | 24 | 700 | Section headings |
| h4 | 20 | 700 | Sub-headings |
| bodyLg | 18 | 400 | Body / instructions |
| body | 17 | 400 | Standard body |
| bodySm | 16 | 400 | Captions, secondary body |
| buttonLg | 20 | 800 | Large CTA labels |
| button | 18 | 700 | Standard button labels |
| label | 16 | 600 | Form labels |
| caption | 16 | 700 | Pills, eyebrow labels |
| icon | 20 | 500 | Icon button glyphs |
| iconLg | 24 | 900 | Large icon glyphs |

#### Spacing (`space`) — 4-pt grid
`xs:4`, `sm:8`, `md:16`, `lg:24`, `xl:32`, `xxl:48`

#### Border radius (`radius`)
`sm:12`, `md:16`, `lg:24`, `xl:28`, `full:999`

#### Component objects (`ui`)
| Object | Description |
|---|---|
| `ghostBtn` | 56×56, r28, rgba(white,0.10) bg, border @0.20 — back/close buttons |
| `orangeBtn` | 56×56, r28, #FFA940 bg, shadow — help/info buttons |
| `primaryBtn` | Full-width, #FFA940, paddingV:20, r28, shadow — main CTAs |
| `card` | rgba(white,0.07), r16, border mint@0.18 — cards on dark |
| `labelPill` | #FFA940, r10, padding 14×6 — orange label pills |
| `progressTrack` / `progressFill` | Session progress bar components |

---

### Global Changes Applied

#### Orange unification
`#FE9C2D` → `#FFA940` across all JS files. Now one canonical orange everywhere.

#### Text opacity standardization
- `color: rgba(255,255,255,0.55/0.50/0.45)` → `0.60` (secondary text)
- `color: rgba(255,255,255,0.40/0.35)` → `0.38` (faint/hint text)
- Borders and shadows were NOT touched — only `color:` properties.

#### `SettingsScreen.js`
- DIM constant: 0.45 → 0.60
- backBtn: 44×44/r22 → 56×56/r28 ghost
- Section cards: borderRadius 18*SC → 16
- Modal close button: r14*SC → r28, paddingVertical 14 → 20, orange shadow

#### `ProgressScreen.js`
- DIM constant: 0.40 → 0.38
- backBtn: 44×44 → 56×56
- All cards (ScoreCard, MilestoneBadge, StatCard, noBaselineCard): borderRadius → 16, borderColor → 0.18
- Retry button: r22 → r28, paddingVertical 13 → 20

#### `SpeechEnhancementScreen.js`
- backBtn: 60×60/r30 → 56×56/r28

#### `StreakCelebrationScreen.js`
- continueBtn: r16 → r28, paddingVertical 18 → 20, shadow standardized

#### `StreakCommitmentScreen.js`
- shareBtn and commitBtn: standardized to design system pill CTAs

#### `HomeScreen.js`
- speechCard: borderRadius 22 → 16, borderColor 0.22 → 0.18

#### Onboarding screens

| Screen | Change |
|---|---|
| `SplashScreen.js` | StatusBar: dark-content → light-content |
| `SignUpScreen.js` | backBtn → 56×56 ghost; inputCard r10→16; CTA → orange pill "Create Account →"; arrowText 32px→18px |
| `SignInScreen.js` | Same pattern; socialCard r10→16; CTA "Sign In →" |
| `SetupAboutYouScreen.js` | backBtn → light ghost (rgba(28,64,71,0.12)); inputCard/selectCard r10→16; nextBtn → full-width pill "Continue →" |
| `SetupPermissionsScreen.js` | CARD_BORD 0.20→0.18 |

#### Session/exercise screens

| Screen | Change |
|---|---|
| `CheckinScreen.js` | sentenceCard.borderColor → rgba(195,222,206,0.18) |
| `BreathingExercise.js` | closeBtn/helpBtn 60→56, r30→28; iconBtn 44→56, r22→28; gradients updated to theme tokens |
| `SustainedPhonationExercise.js` | orangeText 22→24; pill padding standardized; letterSpacing 1.0→0.8 |
| `DolphinVowelsExercise.js` | BTN 52→56; ghost/orange buttons standardized; badge pill standardized; INSTRUCTION_BG → '#1C3242' |
| `LoudnessDrillsExercise.js` | All icon buttons 60→56, r30→28; arrowText/xText 22→20 |
| `PitchGlidesExercise.js` | BTN_SZ: `Math.round(fs(53))` → fixed 56; close button standardized |
| `AssessmentScreen.js` | No changes needed — already compliant |

---

### Still Pending (Post Session 6)

1. **EAS update** — `cd frontend && eas update --branch main --message "Style guide implementation"` (run from `frontend/` dir, not `frontend/src/`)
2. **Firestore security rules** — Still open test mode. Must lock down before public launch.
3. **Apple EAS credentials** — Not configured in EAS dashboard.
4. **App Store assets** — Icon, screenshots, description, Privacy Policy URL not yet prepared.
5. **iOS privacy manifest** — `PrivacyInfo.xcprivacy` not yet added.
6. **401 auto-refresh** — Expired tokens surface as errors; should intercept and retry with `user.getIdToken(true)`.
7. **SetupVoice duplicate clone guard** — Check for existing `voice_id` before calling `/api/voice/clone` on re-entry.
8. **VoiceOver / TalkBack audit** — Screen reader behaviour not fully tested. Arc score labels need `accessibilityLabel`.
9. **Dynamic text scaling** — App uses fixed font sizes; does not respond to OS "Larger Text" setting.

---

### How to Deploy After Session 6

```bash
# OTA update to Expo Go testers (run from frontend/ directory)
cd frontend
eas update --branch main --message "Style guide implementation"

# Backend unchanged — no Render deploy needed
```

---

## Session 7 — Multi-Persona Production Review (2026-06-30)

### Overview

Full 5-persona iterative review of the entire codebase — Senior Apple Developer, Senior Designer, Data Analyst, Speech Therapist, and Parkinson's Patient (first-time user). Every screen was audited individually. All critical bugs found were fixed in this session.

---

### Persona 1: Senior Apple Developer

**Findings and what was fixed:**

| Bug | File | Fix |
|---|---|---|
| Skip button white text on #FFA940 orange (1.9:1 contrast — WCAG fail) | `SetupVoiceScreen.js` | `skipText.color` `#FFFFFF` → `#1A1A1A` |
| Progress dots `#1C4047` on dark teal bg — completely invisible | `SetupVoiceScreen.js` | `dotOther.backgroundColor` → `rgba(255,255,255,0.22)` |
| `setAudioModeAsync({ allowsRecordingIOS: true })` called on start but never reset to `false` — blocks audio playback in rest of app | `SetupVoiceScreen.js` | Added `await Audio.setAudioModeAsync({ allowsRecordingIOS: false })` in `stopRecording()` after `stopAndUnloadAsync()` |
| No visual/text feedback during recording — user cannot tell if mic is capturing | `SetupVoiceScreen.js` | Added `recordingStatus` label: "Recording… tap to stop" / "Sentence X of 3" with `accessibilityLiveRegion="polite"` |
| WhatIsEloquaScreen uses 🐬 emoji instead of real `Dolphin2.png` asset | `WhatIsEloquaScreen.js` | Replaced `<Text>🐬</Text>` + illustration container with `<Image source={require('…/Dolphin2.png')} />` |
| HowItWorksScreen CTA `paddingVertical: 18` (design system specifies 20) | `HowItWorksScreen.js` | 18 → 20 |
| VoiceCloningExplainerScreen CTA `paddingVertical: 18` | `VoiceCloningExplainerScreen.js` | 18 → 20 |
| White text on all exercise orange "?" buttons (1.9:1 — WCAG fail) | SustainedPhonation, DolphinVowels, LoudnessDrills, PitchGlides, FunctionalSpeech | `color: '#FFFFFF'` → `'#1A1A1A'` on all orange-bg text |
| SignUpScreen missing email regex validation | `SignUpScreen.js` | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` validation added |
| T&Cs checkbox using `accessibilityRole="button"` | `SignUpScreen.js` | → `"checkbox"` + `accessibilityState={{ checked: agreed }}` |
| ProgressScreen MilestoneBadge has no accessibility label | `ProgressScreen.js` | `accessible={true}` + `accessibilityRole="image"` + descriptive `accessibilityLabel` added |
| ProgressScreen `headerTitle` at `20*SC` — scales with device width | `ProgressScreen.js` | Fixed at `20` |

---

### Persona 2: Senior Designer

**Findings (Developer → Designer iteration):**

- *"The emoji dolphin on WhatIsEloquaScreen is jarring next to polished gradient screens — it telegraphs 'placeholder'. Dolphin2.png exists in assets. Use it."* → Fixed.
- *"'LSVT LOUD therapy' is clinical jargon. A 70-year-old reading this on their phone for the first time will not know what that means. Rewrite as: 'exercises used in professional voice therapy, adapted for daily use'."* → **Outstanding — copy edit for V1.5**.
- *"SetupVoiceScreen has no confirmation that the recording was captured. After pressing stop, the user gets silence and the next sentence appears. Add 'Got it! ✓' or a checkmark animation."* → Partially fixed: status label shows sentence progress. A ✓ flash animation would be V1.5.
- *"The check-in comparison screen shows before/after arc graphs but the delta score isn't celebrated when it's positive. When a user improves 19 points, show '↑ 19 points!' in orange before the chart settles."* → **Outstanding — V1.5 enhancement**.
- *"Speech Enhancement results card has no visual cue that audio is playing. Wire `isPlaying` state to an Animated scale loop on the play icon."* → **Outstanding — V1.5**.
- *"HomeScreen roadmap is a strong differentiator. First-time users don't know what the sine wave means. One-time tooltip: 'These are your sessions. Tap the highlighted node to start.' Gate with AsyncStorage, dismiss on tap."* → **Outstanding — V1.5**.

---

### Persona 3: Data Analyst

**Findings and what was implemented:**

New `logScreenView(screen)` function added to `frontend/src/utils/analytics.js`. Writes `screen_events` collection with `{ screen, entered_at, exited_at, duration_s, hour_of_day }`. Returns a cleanup function for unmount. Called in a `useEffect` on every screen.

**Coverage now complete — 17 screens wired:**

| Screen | Event |
|---|---|
| SignUp, SignIn | `logScreenView` |
| WhatIsEloqua, HowItWorks, VoiceCloningExplainer | `logScreenView` (added this session) |
| SetupPermissions, SetupAboutYou, SetupVoice, Personalise, AboutYouIntro | `logScreenView` (added this session) |
| Home, SpeechEnhancement, Assessment, Checkin, Progress, VocalTrainingSession, Settings | `logScreenView` (already existed) |

**Funnel events now complete:**
`signup_completed` → `about_you_completed` → `assessment_baseline_started` → `assessment_baseline_completed` → `home_first_visit` → `checkin_completed` → `voice_setup_completed` / `voice_setup_skipped`

**What the pilot data will tell us:**
- `assessment_baseline_started` >> `assessment_baseline_completed` → assessment is too long/stressful
- `session_logs` where `completed: false` at `abandoned_at_exercise_index ≤ 1` → first exercise is confusing
- `screen_events[SpeechEnhancement].duration_s` vs. `usage_events[speech_enhance_completed]` → if median screen time < processing time, users leave before results

**Outstanding (V1.5):**
- Add `round_attempts` per exercise to `logSessionEvent` (pipe `missCountRef` through)
- Track personal sentence `word_count` over check-ins — shorter sentences over time may indicate fatigue/deterioration

---

### Persona 4: Speech Therapist

**Clinical validation findings:**

| Area | Status |
|---|---|
| Rainbow Passage (AssessmentScreen) | ✅ Clinically validated SLP instrument |
| 3-round sustained phonation matching LSVT LOUD protocol | ✅ |
| Loudness drills (SPL targeting) | ✅ |
| Pitch glides (WebView autocorrelation) | ✅ |
| Functional Speech (STT word matching) | ✅ (implicit articulation check) |

**Critical clinical gaps (not yet implemented):**

1. **Maximum Phonation Time (MPT)** — LSVT defines clinical improvement as MPT > 15 seconds sustained. The current SustainedPhonation exercise scores by volume but does not record *duration in seconds*. A 4-second phonation and a 12-second phonation can both score 100 if loud enough. MPT is the standard baseline LSVT metric. **Outstanding for V1.5.**

2. **No articulation component** — Consonant distortion and mumbling are primary PD complaints alongside loudness. DolphinVowels targets vowel range; FunctionalSpeech implicitly checks articulation via STT. But there is no explicit consonant drill. The "pa-ta-ka" diadochokinetic (DDK) rate test (5 seconds rapid repetition → STT → words/second) is a standard SLP screening tool. **Outstanding for V2.0.**

3. **Personal sentence delta display** — Current check-in comparison shows aggregate scores (Voice Power, Expression, Fluency). The patient's own sentence specifically should show pre vs. post. This creates direct ecological validity — the patient hears and sees improvement on words they actually say daily. **Outstanding for V1.5.**

4. **Score label tooltips** — "Voice Power", "Expression", "Fluency" are accessible to lay users but SLPs would benefit from a tap-to-expand explanation. **Outstanding for V1.5.**

---

### Persona 5: Parkinson's Patient (First-Time UX Audit)

**Simulated as: 68 years old, mild-to-moderate PD, no prior speech therapy app experience.**

*"I opened the app and saw a wave and some glowing circles. I didn't know what to do. I tapped a node — it said 'Breathing'. That was gentle. Then 'Sustained Sound' — it told me to hold 'Aah'. The bar barely moved. I gave up after 20 seconds. I went back to the home screen and my progress hadn't changed. I thought I'd broken something."*

**Bugs fixed this session:**
- ✅ Skip button was unreadable (white on orange) — now `#1A1A1A`
- ✅ Dots on SetupVoiceScreen invisible — now `rgba(255,255,255,0.22)`
- ✅ No confirmation mic was working during voice setup — now shows "Recording… tap to stop"

**Outstanding (V1.5):**
- Real-time coaching text triggers at 6 seconds (too long for anxious first-time users). Reduce to 3 seconds for first session.
- Day 1 has ~27 minutes total (Assessment ~12 min + first training ~15 min). Too long with no payoff. Add "Quick Start" path: skip assessment, start at tier 1 defaults, get into training in 2 minutes.
- TextInput for personal sentence is painful with tremor. Add "Tap to speak" option (STT populates the field).
- Streak reset to 0 on a missed day is demoralising. Add a grace period or a "1 freeze per week" mechanic.
- Notifications not surfaced in onboarding. `notificationService.js` exists — add an opt-in step during SetupAboutYou.

---

### All Files Changed This Session

| File | Change |
|---|---|
| `frontend/src/utils/analytics.js` | Added `logScreenView()` function |
| `frontend/src/screens/onboarding/SetupVoiceScreen.js` | Skip button contrast, dots, audio mode cleanup, recording status label, logScreenView, logFunnelEvent |
| `frontend/src/screens/onboarding/WhatIsEloquaScreen.js` | Dolphin2.png image, logScreenView |
| `frontend/src/screens/onboarding/HowItWorksScreen.js` | CTA paddingVertical 18→20, logScreenView |
| `frontend/src/screens/onboarding/VoiceCloningExplainerScreen.js` | CTA paddingVertical 18→20, logScreenView |
| `frontend/src/screens/onboarding/SignUpScreen.js` | Email regex validation, checkbox accessibilityRole, logScreenView (background agent + this session) |
| `frontend/src/screens/onboarding/SignInScreen.js` | logScreenView |
| `frontend/src/screens/onboarding/SetupAboutYouScreen.js` | logScreenView |
| `frontend/src/screens/onboarding/SetupPermissionsScreen.js` | logScreenView |
| `frontend/src/screens/onboarding/PersonaliseScreen.js` | logScreenView |
| `frontend/src/screens/onboarding/AboutYouIntroScreen.js` | logScreenView |
| `frontend/src/screens/SettingsScreen.js` | logScreenView; mp.sub contrast 0.28→0.55 |
| `frontend/src/screens/ProgressScreen.js` | MilestoneBadge accessibility; headerTitle 20*SC→20; dim/desc contrast |
| `frontend/src/screens/AssessmentScreen.js` | largeText wiring (passage, instruction, body, focusTip); contrast fixes |
| `frontend/src/screens/CheckinScreen.js` | largeText wiring (sentenceText, body); logFunnelEvent('checkin_completed'); contrast fixes |
| `frontend/src/screens/SpeechEnhancementScreen.js` | largeText wiring (liveTextDim); logScreenView |
| `frontend/src/screens/vocaltraining/exercises/SustainedPhonationExercise.js` | Orange button text `#1A1A1A`; contrast fixes |
| `frontend/src/screens/vocaltraining/exercises/DolphinVowelsExercise.js` | Orange button text `#1A1A1A`; contrast fixes |
| `frontend/src/screens/vocaltraining/exercises/LoudnessDrillsExercise.js` | Orange button text `#1A1A1A` |
| `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js` | Orange button text `#1A1A1A` |
| `frontend/src/screens/vocaltraining/exercises/FunctionalSpeechExercise.js` | Orange button text `#1A1A1A` (background agent) |
| `frontend/src/context/PrefsContext.js` | Added `useHapticFeedback()` and `useAudioCues()` hooks (background agent) |

---

### What Needs To Be Done Next

#### Immediate — Before TestFlight (must complete by ~2026-07-04)

1. **Deploy** — `cd frontend && eas update --branch main` from the `frontend/` directory
2. **Firestore security rules** — Lock down in Firebase console. Rules are documented in Session 4 notes above. Anyone with the project ID can read/write all user data right now.
3. **ToS / Privacy Policy URLs** — `SignUpScreen.js` has dead `<Text>Terms of Service</Text>` spans. Must link to real hosted documents. App Store requires a privacy policy URL.
4. **App Store ID** — Replace `id000000000` in `SettingsScreen.js` Rate App URL with the real App Store ID (created on first submission).
5. **Render upgrade** — Free tier sleeps after 15 min. First speech enhancement request wakes it in 10–20 seconds. Upgrade to paid tier ($7/mo) before users see this.

#### V1.5 — Before App Store Submission

6. **MPT tracking in SustainedPhonation** — Record seconds sustained, not just volume. LSVT target is MPT > 15s. Surface in ProgressScreen.
7. **HomeScreen first-visit tooltip** — "Tap the highlighted node to start" overlay, dismiss on tap, gate with `@eloqua_roadmap_tip_shown` in AsyncStorage.
8. **Speech Enhancement playback animation** — Wire `isPlaying` state to `Animated.loop` scale on the play icon.
9. **Per-exercise attempt count** — Pipe `missCountRef.current` from `LoudnessDrillsExercise` through to `logSessionEvent` as `round_attempts`.
10. **Check-in personal sentence delta** — Show pre vs. post score on the patient's specific sentence in the comparison phase.
11. **Real-time exercise coaching trigger** — Reduce idle coaching text from 6s to 3s for first session (important for anxious Parkinson's patients).
12. **WhatIsEloquaScreen copy** — Replace "LSVT LOUD therapy principles" with plain-language equivalent for lay users.
13. **Speech-to-text in CheckinScreen** — "Tap to speak" option to populate personal sentence TextInput (tremor accommodation).

#### V2.0 — Post-Pilot

14. Caregiver dashboard (read-only web view of patient scores/streak)
15. Speech therapist portal (SLP data access + difficulty override)
16. DDK "pa-ta-ka" articulation assessment
17. Voice fatigue detection across a session
18. Medication timing correlation
19. Offline mode for on-device exercises
20. Tablet (iPad) layout fixes — see `additional-thoughts.md` for all 18 items

---

### Deploy Command

```bash
# From the frontend/ directory (IMPORTANT — not the repo root)
cd frontend
eas update --branch main --message "Session 7: accessibility + analytics + onboarding fixes"
```

Backend unchanged — no Render deploy needed.

---

## Session 8 — Exercise UX Polish: Instruction Standardisation & Loudness Drills Overhaul (2026-07-13)

### Overview

Two user requests addressed:
1. Standardise all exercise instruction screens to a single consistent format.
2. Overhaul Loudness Drills: punchier content, faster feedback, "too soft" prompting, green success flash.

Additional quick wins: breathing bubble prominence improved, CantDoNow trigger made more visible.

---

### Standard Instruction Format (now applied to all exercises)

All five exercise instruction/intro screens now share a single layout:

```
ScreenHeader (✕ exit + SpeakerButton TTS)
↓
Large exercise title (52–64 px, fontWeight 800, 2-line centred)
↓
3-step numbered card (orange badge circles, white text rows)
↓
Orange "Let's Go  →" CTA button (paddingV 20, borderRadius 28, shadow)
```

Previously: LoudnessDrills used a 3-slide animated demo; PitchGlides and DolphinVowels used slide carousels; FunctionalSpeech showed speech bubbles with no instructions. All replaced with the single-screen card.

---

### File-by-file changes

#### `SustainedPhonationExercise.js`
- INSTRUCTIONS updated from 4 steps to 3:
  - Removed "Sit up straight" (irrelevant for seated/bedridden users)
  - Removed "Watch the waveform bars" (redundant — the bars are self-evident)
  - Added "Hold your phone at arm's length — or place it on a table in front of you." (clinically important for mic distance)

#### `LoudnessDrillsExercise.js` — major overhaul
- **Content:** `LOUDNESS_TIER_CONFIG` replaced with 5 tiers of progressively longer punchy content:
  - Tier 1: single words ("GO", "LOUD", "NOW", "YES", "HEY")
  - Tier 2: 2-word phrases ("Speak up!", "Say it!", etc.)
  - Tiers 3–5: 3→4→5→6→7→8 word phrases
- **Speed:** Whisper timeout 5000 ms → 2500 ms. Tier-1 single words skip Whisper entirely (volume-only check) for instant feedback.
- **"Too soft" detection:** `SOFT_DETECT_VOL = 0.12` constant. If mic vol is audible but below threshold for 500 ms, shows orange "SAY IT LOUDER!" pill overlay above the word card.
- **Green success flash:** `wordSuccess` state set true for 300 ms when a word is detected correctly before advancing — `WordCard` shows green border and glow (`#48D28C`) instead of orange.
- **Demo screen:** Old 3-slide `DemoJellyfish` carousel replaced with single-screen card (DEMO_STEPS, `ScreenHeader`, card, "Let's Go →").
- **`ds` StyleSheet** replaced with `card`, `row`, `badge`, `badgeNum`, `stepText`, `startBtn`, `startText` card layout styles.

#### `BreathingExercise.js`
- `BUBBLE_BASE` 240 → 280 (larger bubble)
- `SCALE_SMALL` 0.34 → 0.30 (smaller at rest → more dramatic expansion)
- Added teal glow ring (`Animated.View`) behind the bubble image; opacity interpolated from `bubbleScale` so the ring is invisible when inhaling and at max opacity at full expansion — provides a clear "breathe in" visual cue.

#### `CantDoNow.js` — "Skip exercise for now" trigger
- Changed from plain faded text to a visible ghost pill with border:
  - `borderRadius: 22`, `borderWidth: 1`, `borderColor: rgba(255,255,255,0.22)`, `backgroundColor: rgba(255,255,255,0.06)`
  - Text: `fontSize: 15`, `fontWeight: '500'`, `color: rgba(255,255,255,0.60)` — readable without competing with the exercise UI

#### `DolphinVowelsExercise.js`
- `DemoScreen` already uses the card format (`VOWEL_INSTR_STEPS`, `ScreenHeader`, `SpeakerButton`, "Let's Go →"). No changes needed.

#### `PitchGlidesExercise.js`
- `TutorialScreen` already uses the card format (`PITCH_INSTR_STEPS`, `ScreenHeader`, `SpeakerButton`, "Let's Go →"). No changes needed.

#### `FunctionalSpeechExercise.js`
- `IntroScreen` already uses the card format (`SPEECH_INSTR_STEPS`, `ScreenHeader`, `SpeakerButton`, "Let's Go →"). No changes needed.

---

### Still Pending

Items carried forward from Session 7 (in priority order):

#### Immediate — Before TestFlight
1. **Deploy** — `cd frontend && eas update --branch main`
2. **Firestore security rules** — Still open test mode. Lock down in Firebase console before any public launch.
3. **ToS / Privacy Policy URLs** — `SignUpScreen.js` has dead text spans. Must link to hosted documents. App Store requires a privacy policy URL.
4. **App Store ID** — Replace `id000000000` in `SettingsScreen.js` Rate App URL with the real App Store ID.
5. **Render upgrade** — Free tier sleeps after 15 min. Upgrade to paid tier ($7/mo) before users experience cold starts.

#### V1.5 — Before App Store Submission
6. **HomeScreen first-visit tooltip** — "Tap the highlighted node to start" overlay, gated with AsyncStorage.
7. **Speech Enhancement playback animation** — Wire `isPlaying` state to `Animated.loop` scale on the play icon.
8. **Check-in personal sentence delta** — Show pre vs. post score on the patient's specific sentence in comparison phase.
9. **Real-time exercise coaching trigger** — Reduce idle coaching from 6 s to 3 s for first session (anxious Parkinson's patients).
10. **WhatIsEloquaScreen copy** — Replace "LSVT LOUD therapy principles" with plain-language equivalent.
11. **Speech-to-text in CheckinScreen** — "Tap to speak" option to populate personal sentence TextInput (tremor accommodation).
12. **SetupVoiceScreen confirmation animation** — "Got it! ✓" flash after each recorded sentence stops.
13. **hapticFeedback / audioCues** — Wired in PrefsContext but not yet connected to `expo-haptics` or audio cue playback.

#### V2.0 — Post-Pilot
14. Caregiver dashboard (read-only web view of patient scores/streak)
15. Speech therapist portal (SLP data access + difficulty override)
16. DDK "pa-ta-ka" articulation assessment
17. MPT surface in ProgressScreen (data already recorded from baseline; not yet shown)
18. Voice fatigue detection across a session
19. Medication timing correlation
20. Offline mode for on-device exercises
21. Tablet (iPad) layout fixes — see `additional-thoughts.md` for all 18 items

---

### Deploy Command

```bash
# From the frontend/ directory (IMPORTANT — not the repo root)
cd frontend
eas update --branch main --message "Session 8: exercise instruction standardisation + loudness drills overhaul"
```

Backend unchanged — no Render deploy needed.
