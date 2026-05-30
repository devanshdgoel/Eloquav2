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

#### V3.6 — Three Onboarding Explainer Screens
`WhatIsEloquaScreen`, `HowItWorksScreen`, and `VoiceCloningExplainerScreen` added to the new-user onboarding flow, inserted between `SignUpScreen` and `PersonaliseScreen`. Required for App Store review: the `VoiceCloningExplainerScreen` provides a privacy-first framing of why voice recordings are collected.

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
