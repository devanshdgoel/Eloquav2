# Eloqua — Errors & Fixes Log

Running log of every bug encountered, its root cause, and the fix applied.
Add new entries at the top of each section. Include the date when known.

---

## How to add an entry

```
### [Short title of the bug]
**Date:** YYYY-MM-DD (or "unknown")
**Symptom:** What you saw — error message, crash, wrong behaviour.
**Root cause:** Why it happened.
**Fix:** Exactly what was changed.
**File(s):** Which files were touched.
```

---

## 1. Expo & React Native

---

### Pitch Glides crashes immediately in Expo Go
**Date:** 2026-05-24  
**Symptom:** App crashes at startup when navigating to Pitch Glides in Expo Go (not a dev build).  
**Root cause:** `react-native-pitch-detector` is a native module. Expo Go does not bundle third-party native modules and crashes at `import` time — there is no way to catch this with try/catch.  
**Fix:** Removed the import entirely. Replaced with a hidden `react-native-webview` (already bundled in Expo Go) running Web Audio API autocorrelation entirely in JS. The WebView posts `{ pitch: Hz, vol: 0–1 }` messages to React Native every 80 ms.  
**Files:** `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js`  
**Note:** `react-native-pitch-detector` is still in `package.json` but no longer imported. Remove it with `npm uninstall react-native-pitch-detector`.

---

### Expo Go 403 — testers can't scan QR code
**Date:** 2026-05-23  
**Symptom:** Testers scanning the EAS Update QR code get a 403 "not authorised" error in Expo Go.  
**Root cause:** The project was published under a personal Expo account with `privacy: 'unlisted'`. Testers not logged into that account cannot access it.  
**Fix:** Created a shared `eloqua-team` organisation on expo.dev. Updated `app.config.js`:
```js
owner: 'eloqua-team',
privacy: 'public',
extra: { eas: { projectId: '<new-project-id>' } }
```
Re-ran `eas update --branch main`.  
**Files:** `frontend/app.config.js`

---

### Metro bundler: "Unable to resolve module" after npm install
**Date:** unknown  
**Symptom:** After installing a new package, Metro shows "Unable to resolve module X from Y" even though the package is in `node_modules`.  
**Root cause:** Metro caches its module graph and doesn't always detect newly installed packages.  
**Fix:**
```bash
npx expo start --clear
# or, if that doesn't help:
cd frontend && rm -rf node_modules/.cache && npx expo start --clear
```
**Files:** none (cache only)

---

### `useNativeDriver` crash on layout properties
**Date:** unknown  
**Symptom:** Yellow box warning / crash: "Style property X is not supported by native animated module."  
**Root cause:** `useNativeDriver: true` cannot be used with layout properties (`width`, `height`, `top`, `left`, `padding`, etc.). Only transform and opacity are supported.  
**Fix:** Change `useNativeDriver: true` → `useNativeDriver: false` for any animation that drives a layout property. In this codebase the progress bar width animations all correctly use `false`.  
**Files:** any file using `Animated.timing` with layout properties

---

### `import React` missing — "React is not defined"
**Date:** 2026-05  
**Symptom:** Crash on screen load; "React is not defined" or blank screen with no error.  
**Root cause:** Older JSX transform requires `import React from 'react'` at the top of every file that contains JSX. Expo SDK 54 uses the new transform but some files were written without the import.  
**Fix:** Added `import React from 'react';` to `BrandReveal.js` and `SplashButtons.js`.  
**Files:** `frontend/src/screens/onboarding/BrandReveal.js`, `SplashButtons.js`

---

### Image/asset not found at runtime
**Date:** unknown  
**Symptom:** `Unable to resolve asset` or blank image.  
**Root cause:** Dynamic `require()` calls (e.g., `require(someVariable)`) are not supported by Metro — it only resolves static string literals at build time.  
**Fix:** Always use a static `require`: `require('../../../../assets/images/Dolphin2.png')`. Never compute the path dynamically.  
**Files:** any file using `require()` for assets

---

## 2. Audio (expo-av)

---

### iOS recording fails silently / playback breaks recording
**Date:** unknown  
**Symptom:** `Audio.Recording.createAsync` rejects or mic produces no signal on iOS.  
**Root cause:** iOS requires the audio session to be put into recording mode _before_ creating a recording. If the mode is set to playback (`allowsRecordingIOS: false`) and you try to record, it fails.  
**Fix:** Always call before recording:
```js
await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
```
And after recording (before playback):
```js
await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
```
**Files:** `SpeechEnhancementScreen.js`, `CheckinScreen.js`, `SustainedPhonationExercise.js`, `LoudnessDrillsExercise.js`, `FunctionalSpeechExercise.js`

---

### Sound plays at zero volume on iOS silent mode
**Date:** unknown  
**Symptom:** TTS playback (expo-speech) or audio file playback is silent when iOS ringer switch is off.  
**Root cause:** iOS audio session defaults to respecting the silent/ringer switch.  
**Fix:** Set `playsInSilentModeIOS: true` in `Audio.setAudioModeAsync` before any playback.  
**Files:** `FunctionalSpeechExercise.js`, `SpeechEnhancementScreen.js`

---

### Recording left open after screen unmount → "Audio session already in use"
**Date:** 2026-05  
**Symptom:** Navigating away mid-recording then coming back causes "already in use" errors or silent mic.  
**Root cause:** `Audio.Recording` was not stopped/unloaded in the component cleanup function.  
**Fix:** Add a `useEffect` return that calls `recording.stopAndUnloadAsync()`:
```js
useEffect(() => {
  return () => {
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
  };
}, []);
```
**Files:** `SetupVoiceScreen.js`, `CheckinScreen.js`

---

## 3. Firebase / Firestore

---

### "Missing or insufficient permissions" on Firestore reads/writes
**Date:** 2026-05-23  
**Symptom:** Firestore client SDK calls throw `FirebaseError: Missing or insufficient permissions`.  
**Root cause (a):** Firestore test-mode rules expire after 30 days. After expiry, all client SDK requests are rejected.  
**Root cause (b):** The security rules don't allow the authenticated user to access their own document path.  
**Fix (a):** For progress updates, route them through the FastAPI backend using the Firebase Admin SDK (`/api/complete-session`), which bypasses Firestore security rules entirely.  
**Fix (b — production):** Set proper Firestore rules in the Firebase console:
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
**Files:** `backend/api/progress_routes.py`, Firestore console

---

### Firebase already initialised error on hot reload
**Date:** unknown  
**Symptom:** `Firebase: Firebase App named '[DEFAULT]' already exists (app/duplicate-app)` in Metro logs.  
**Root cause:** Hot reload re-executes `initializeApp()` but the Firebase app object persists in memory.  
**Fix:** Guard the initialisation:
```js
import { initializeApp, getApps, getApp } from 'firebase/app';
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
```
**Files:** `frontend/src/config/firebase.js`

---

### Auth state lost between app restarts
**Date:** unknown  
**Symptom:** User is signed out every time they close and reopen the app.  
**Root cause:** Firebase Auth's default in-memory persistence doesn't survive process restarts in React Native.  
**Fix:** Pass AsyncStorage as the persistence layer when initialising Firebase Auth:
```js
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
```
**Files:** `frontend/src/config/firebase.js`

---

### Redundant `initialize_firebase()` call in auth dependency
**Date:** 2026-05  
**Symptom:** Potential double-init of Firebase Admin SDK in the backend.  
**Root cause:** `auth_dep.py` called `initialize_firebase()` on every request, which is a no-op after the first call but unnecessary.  
**Fix:** Removed the call from `auth_dep.py`; Firebase Admin SDK is initialised once in `main.py` via `initialize_firebase()` at startup.  
**Files:** `backend/utils/auth_dep.py`

---

## 4. Backend (FastAPI / Render)

---

### Render deploy crash — exit code 1 at startup
**Date:** 2026-05-23  
**Symptom:** Render build succeeds but the service immediately crashes with exit code 1. Logs show `ModuleNotFoundError: No module named 'librosa'` (or `numpy`, `soundfile`).  
**Root cause:** New Python packages were imported in service code but not added to `requirements.txt`. Render installs only what is listed there.  
**Fix:** Add missing packages to `requirements.txt`:
```
librosa>=0.10.0
numpy>=1.24.0
soundfile>=0.12.0
```
**Files:** `backend/requirements.txt`

---

### Render cold start — first request takes 30–60 s
**Date:** ongoing  
**Symptom:** After ~15 minutes of inactivity, the first API call from the app hangs for 30–60 seconds.  
**Root cause:** Render free tier spins down idle services. The next request wakes the dyno, which takes 30–60 s to start.  
**Fix options:**
- (Quick) Show a "Connecting to server…" indicator in the app while waiting.
- (Permanent) Upgrade Render to a paid plan ($7/mo) to keep the service always-on.
- (Workaround) Set up a cron job (e.g., UptimeRobot pinging `/health` every 10 min) to keep the service alive.  
**Files:** none yet

---

### CORS error — frontend request blocked
**Date:** unknown  
**Symptom:** `Access-Control-Allow-Origin` error in browser/Expo Go; API calls fail with CORS.  
**Root cause:** The frontend origin (Expo Go dev URL or production domain) is not listed in `ALLOWED_ORIGINS` in `backend/config.py`.  
**Fix:** Add the origin to `ALLOWED_ORIGINS` (environment variable on Render, or in `config.py` for local dev). The value `*` works for development but should not be used in production.  
**Files:** `backend/config.py`

---

### Path traversal in audio file endpoint
**Date:** 2026-05  
**Symptom:** Security vulnerability — `GET /api/audio/../../../etc/passwd` could potentially serve arbitrary files.  
**Root cause:** The route was constructing a file path from user-supplied `filename` without validating it stayed inside the audio directory.  
**Fix:** After joining the path, resolve it and check it starts with the expected directory prefix:
```python
full_path = (AUDIO_DIR / filename).resolve()
if not str(full_path).startswith(str(AUDIO_DIR.resolve())):
    raise HTTPException(status_code=400, detail="Invalid filename")
```
**Files:** `backend/api/audio_routes.py`

---

## 5. ElevenLabs / Voice Cloning

---

### Voice cloning silently fails — multipart boundary stripped
**Date:** 2026-05  
**Symptom:** `POST /api/voice/clone` returns 200 but no voice is cloned. ElevenLabs returns a 400 with "invalid body".  
**Root cause:** `voiceService.js` manually set `Content-Type: multipart/form-data` in the `fetch` headers. This overrides the boundary parameter that `fetch` automatically appends (e.g., `Content-Type: multipart/form-data; boundary=----FormBoundary123`). Without the boundary, ElevenLabs cannot parse the body.  
**Fix:** Remove the `Content-Type` header entirely. When using `FormData`, `fetch` sets the correct content-type with the boundary automatically.
```js
// WRONG:
headers: { 'Content-Type': 'multipart/form-data' }
// RIGHT: omit Content-Type entirely — fetch handles it
```
**Files:** `frontend/src/services/voiceService.js`

---

### ElevenLabs error parser crashes — `detail` is a string not a dict
**Date:** 2026-05  
**Symptom:** `AttributeError: 'str' object has no attribute 'get'` in the backend when ElevenLabs returns a 4xx.  
**Root cause:** `response.json().get("detail", {}).get("message")` assumed `detail` was always a dict. ElevenLabs sometimes returns `detail` as a plain string (e.g., `"quota exceeded"`).  
**Fix:** Added an `isinstance` guard:
```python
d = response.json().get("detail", {})
message = d.get("message") if isinstance(d, dict) else str(d)
```
**Files:** `backend/services/voice_cloning_service.py` (or wherever ElevenLabs responses are parsed)

---

### ElevenLabs free tier character cap hit
**Date:** anticipated  
**Symptom:** TTS calls return 429 or "quota exceeded". Voice cloning fails.  
**Root cause:** ElevenLabs free tier has a monthly character limit. Voice cloning + TTS together burn through it quickly.  
**Fix:** Monitor usage in the ElevenLabs dashboard. Upgrade to a paid plan before public launch.  
**Files:** none (account-level)

---

## 6. WebView (Pitch Detection)

---

### `getUserMedia` fails in WKWebView on iOS
**Date:** 2026-05  
**Symptom:** WebView pitch detector never starts; `data.error` fires with "Permission denied" or "NotAllowedError".  
**Root cause:** WKWebView on iOS requires an HTTPS origin to be allowed to call `getUserMedia`. An inline HTML page with no origin (`about:blank`) is blocked.  
**Fix:** Set `baseUrl` to any HTTPS URL (the backend URL works fine — it doesn't make a network request, it just sets the page's origin):
```jsx
<WebView
  source={{ html: PITCH_HTML, baseUrl: 'https://eloqua-backend.onrender.com' }}
  mediaCapturePermissionGrantType={Platform.OS === 'ios' ? 'grant' : undefined}
  ...
/>
```
**Files:** `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js`

---

### WebView mic permission prompt appears on Android
**Date:** 2026-05  
**Symptom:** On Android, a browser-style "Allow microphone" popup appears inside the WebView, which the user may dismiss.  
**Root cause:** Android WebView fires `onPermissionRequest` events for device resources. Without a handler, the request is denied.  
**Fix:** Add an `onPermissionRequest` handler that auto-grants the microphone (the app already has mic permission from expo-av, so this is safe):
```jsx
onPermissionRequest={(e) => { e.nativeEvent.grant?.(e.nativeEvent.resources); }}
```
**Files:** `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js`

---

### WebView pitch detector unreliable with `1×1` size
**Date:** 2026-05  
**Symptom:** Pitch detection works intermittently, especially on iOS. WebView never sends the `{ ready: true }` message.  
**Root cause:** A WebView with dimensions `1×1` or very small may not fully initialise its JS engine on some iOS versions.  
**Fix:** Give the hidden WebView real dimensions (`300×300`) positioned off-screen:
```jsx
style={{ position: 'absolute', width: 300, height: 300, top: -600, left: -600, zIndex: -1 }}
```
**Files:** `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js`

---

## 7. Speech Enhancement / AI Pipeline

---

### Transcript split at chunk boundaries
**Date:** 2026-05  
**Symptom:** Long audio transcripts have sentences cut mid-way and half a sentence appears at the start of the next chunk.  
**Root cause:** The GPT-4o clarity pipeline processes audio in chunks. The chunking cuts at arbitrary byte boundaries, which can land mid-sentence. The final prompt wasn't instructed to re-join split sentences.  
**Fix:** Added a SENTENCE BOUNDARY RULE to the chunked correction system prompt. Added an instruction to the final-pass prompt to re-join any sentence that appears split across a chunk boundary.  
**Files:** `backend/services/clarity_speech.py`

---

### Back button available during recording / enhancing
**Date:** 2026-05  
**Symptom:** User can tap the back/exit button during an active recording or while the backend is processing, leaving the recording open and the upload orphaned.  
**Root cause:** The back button was always rendered.  
**Fix:** Conditionally hide the back button during `RECORDING` and `ENHANCING` phases:
```jsx
{phase !== S.RECORDING && phase !== S.ENHANCING && <BackButton />}
```
**Files:** `frontend/src/screens/SpeechEnhancementScreen.js`

---

## 8. Security (general)

---

### Firestore open test-mode rules before public launch
**Date:** ongoing / anticipated  
**Symptom:** No immediate error — but any user who knows the Firebase project ID can read or write any document.  
**Root cause:** Firestore was put into test mode during development (allows all reads/writes for 30 days). Test mode rules expire and are open until replaced.  
**Fix (before any public launch):** Replace the rules in the Firebase console with:
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
**Files:** Firebase console (not in codebase)

---

## 9. HomeScreen / Roadmap

---

### App crashes when `current_node` is out of `NODE_DEFS` range
**Date:** 2026-05  
**Symptom:** `TypeError: Cannot read property 'X' of undefined` on HomeScreen when the user has completed more sessions than there are node definitions.  
**Root cause:** `NODE_DEFS[current_node]` was accessed without bounds checking. If `sessions_completed` exceeded `TOTAL_NODES - 1`, the index was out of range.  
**Fix:** Clamp `current_node` before use:
```js
const safeNode = Math.max(0, Math.min(NODE_DEFS.length - 1, current_node));
```
**Files:** `frontend/src/screens/HomeScreen.js`

---

## 10. Onboarding

---

### `name.trim()` not applied before saving user profile
**Date:** 2026-05  
**Symptom:** Users could save a profile with a name that was only whitespace (e.g., pressing space then Save).  
**Root cause:** `saveUserProfile` was called with the raw input value.  
**Fix:** Apply `.trim()` before saving and before the "is empty" validation check:
```js
const trimmedName = name.trim();
if (!trimmedName) return; // don't save
saveUserProfile({ name: trimmedName, age });
```
**Files:** `frontend/src/screens/onboarding/SetupAboutYouScreen.js`

---

---

## 11. Difficulty / Tier System

---

### All users started at tier 1 regardless of baseline assessment scores
**Date:** 2026-05-25  
**Symptom:** New users who scored well on their baseline assessment (e.g., voice_power ≥ 55) still started every exercise at tier 1, wasting sessions on trivially easy content.  
**Root cause:** `difficultyService.js` exported `DEFAULT_TIERS = { phonation:1, loudness:1, pitchGlides:1, speech:1 }` and there was no code path that set tiers from assessment scores. `AssessmentScreen.finishAssessment()` never called any tier-setting function.  
**Fix:** Added `tiersFromAssessmentScores(composite)` and `setTiersFromAssessment(compositeScores)` to `difficultyService.js`. Called `setTiersFromAssessment(composite)` in `AssessmentScreen.finishAssessment()` for `isBaseline === true` cases.  
**Files:** `frontend/src/services/difficultyService.js`, `frontend/src/screens/AssessmentScreen.js`

---

### Tier adjustment moved all 4 exercise tiers together (blunt global update)
**Date:** 2026-05-25  
**Symptom:** After a check-in where expression improved significantly but voice_power stayed flat, the loudness and phonation tiers would still go up (incorrectly), because the old logic averaged all three score deltas into one number.  
**Root cause:** `adjustDifficultyAfterCheckin` computed `avgDelta = mean(vp_delta, ex_delta, fl_delta)` and applied one direction to all four exercise keys uniformly.  
**Fix:** Introduced `TIER_SCORE_MAP` mapping each exercise to its driving voice dimension (`phonation/loudness → voice_power`, `pitchGlides → expression`, `speech → fluency`). Each exercise tier now adjusts independently based on its dimension's delta.  
**Files:** `frontend/src/services/difficultyService.js`, `frontend/src/screens/CheckinScreen.js`

---

### Exercise performance data never recorded — sessions left no trace
**Date:** 2026-05-25  
**Symptom:** After completing a training session, there was no record of how well the user performed in each exercise. This made it impossible to use session performance to inform tier adjustments, and the ProgressScreen had no exercise-level data to show.  
**Root cause:** All exercises called `onComplete()` with no arguments. `VocalTrainingSessionScreen.handleExerciseComplete()` accepted no score parameter. No exercise score data was written to Firestore.  
**Fix:**  
1. Each exercise now passes a score (0–100) to `onComplete(score)`:  
   - `SustainedPhonation`: `min(100, bestSeconds/targetSeconds × 100)`  
   - `LoudnessDrills`: penalises miss count  
   - `PitchGlides`, `FunctionalSpeech`: always 100 (complete-only exercises)  
2. `VocalTrainingSessionScreen.handleExerciseComplete(score)` collects scores per exercise type.  
3. `saveSessionExerciseScores(scores)` writes to Firestore `user_progress/{uid}.recent_exercise_scores` (last 14 sessions).  
**Files:** `SustainedPhonationExercise.js`, `LoudnessDrillsExercise.js`, `PitchGlidesExercise.js`, `FunctionalSpeechExercise.js`, `VocalTrainingSessionScreen.js`, `difficultyService.js`

---

---

### Back gesture mid-session silently dropped session credit
**Date:** 2026-05-25  
**Symptom:** Tapping back (or the exercise `onExit` button) during a training session or check-in dismissed the screen immediately with no confirmation. Session credit, Firestore score writes, and the streak counter were all lost.  
**Root cause:** Neither `VocalTrainingSessionScreen` nor `CheckinScreen` had any navigation guard. React Navigation allows `goBack()` / swipe-back without any hook unless the screen explicitly listens for `beforeRemove`.  
**Fix:** Added `navigation.addListener('beforeRemove', e => { e.preventDefault(); Alert.alert(...) })` in both screens. `VocalTrainingSessionScreen` fires when `!isDone`; `CheckinScreen` fires only during `phase === 'mini'`.  
**Files:** `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js`, `frontend/src/screens/CheckinScreen.js`

---

### Personal sentence lost after app reinstall or device switch
**Date:** 2026-05-25  
**Symptom:** After reinstalling the app or switching devices, the check-in screen showed the sentence setup step again, requiring the user to enter a new sentence. This invalidated all prior voice comparisons (different sentence = different baseline).  
**Root cause:** `savePersonalSentence()` and `getPersonalSentence()` in `storage.js` used AsyncStorage exclusively. AsyncStorage is ephemeral — it's cleared on reinstall and doesn't transfer to a new device.  
**Fix:** `savePersonalSentence()` now also writes to Firestore `user_progress/{uid}.personal_sentence`. `getPersonalSentence()` reads AsyncStorage first (fast path), falling back to Firestore on a cache miss, then re-populates AsyncStorage from the remote value.  
**Files:** `frontend/src/utils/storage.js`

---

*Last updated: 2026-05-25*
