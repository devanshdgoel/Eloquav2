# Error Handling & Fallback Routes

This document describes how Eloqua handles failures across every layer of the stack — what we detect, what the user sees, and where they can go next.

---

## Auth & Startup Failures

### Firebase auth hangs on startup
**Where:** `AuthContext.js`
**Trigger:** `onAuthStateChanged` never fires (complete network outage, Firebase SDK bug)
**Mechanism:** 15-second safety timer — if `isLoading` is still `true` after 15 s, force `isLoading: false, authError: true`
**Fallback:** SplashScreen unmutes — user sees the brand reveal + Sign In / Sign Up buttons. A "Trouble restoring your session — please sign in again" banner appears above the buttons.
**Escape:** Tap "Sign In" and authenticate manually. Firebase re-establishes the session from there.

### Firebase auth resolves but fails mid-session
**Where:** Sign-in or Sign-up screens (Firebase SDK error)
**Trigger:** Network loss, wrong credentials, account locked
**Mechanism:** `friendlyError()` in `authService.js` maps Firebase codes to human-readable messages; thrown as JS Error, caught in screen-level try/catch
**Fallback:** `Alert.alert` with the friendly message

---

## Backend Failures

### Global exception handler
**Where:** `backend/main.py`
**Trigger:** Any unhandled exception in a route handler
**Response:** HTTP 500 with `{ "status": "error", "message": "An unexpected error occurred. Please try again." }`
**Frontend interpretation:** Any `!res.ok` path — see per-feature fallbacks below

### Firebase Admin SDK init failure
**Where:** `backend/firebase_config.py`
**Trigger:** Missing `FIREBASE_SERVICE_ACCOUNT_JSON` env var AND no local JSON file
**Response:** `RuntimeError` raised at startup — server refuses to start and logs a `CRITICAL` message
**Action:** Fix the credential before redeploying

### Token validation errors
**Where:** `backend/utils/auth_dep.py`
**Trigger:** Bearer token missing, expired, malformed, or revoked
**Response:**
- Expired token → HTTP 401 with `WWW-Authenticate: Bearer error="invalid_token"` header
- Revoked token → HTTP 403 (permanent — re-auth required)
- Malformed / other → HTTP 401
**Frontend interpretation:** 401 means client can refresh the token and retry; 403 means force sign-out

---

## Feature-Level Fallbacks

### Assessment save fails
**Where:** `AssessmentScreen.finishAssessment()`
**Trigger:** Network error or non-2xx from `/api/save-assessment` or `/api/complete-session`
**Mechanism:** `await` both fetches, check `res.ok`, throw on failure
**Fallback:** Return to `results` phase so scores remain visible; `Alert.alert` with **Try again** (retries save) and **Continue anyway** (navigates Home, data is lost server-side)

### Check-in save fails
**Where:** `CheckinScreen.handleFinish()`
**Trigger:** Network error or failure in `completeSession()` or `adjustDifficultyAfterCheckin()`
**Mechanism:** `catch` block re-enables the Finish button
**Fallback:** `Alert.alert` with **Try again** (retries the whole save) and **Go home** (exits without saving, user is warned)

### Progress data fails to load (Progress screen)
**Where:** `ProgressScreen.loadData()`
**Trigger:** Network error or non-2xx from either `fetchProgress()` or `/api/progress-data`
**Fallback:** Error state with "Could not load your progress" message and a tappable **Retry** button

### Progress data fails to load (Home screen)
**Where:** `HomeScreen` → `fetchProgress()`
**Trigger:** Network error or Firestore timeout
**Fallback:** Orange banner at the top of the roadmap: "Could not load progress — tap to retry". Roadmap renders with last-known state (node 0 if first load).

### FunctionalSpeech exercise — API error
**Where:** `FunctionalSpeechExercise.checkTranscript()`
**Trigger:** Non-2xx response from `/api/process-audio` (including 401 expired token)
**Mechanism:** `!res.ok` check before parsing JSON — prevents empty transcript being treated as a match
**Fallback:** `doAdvance()` — leniently passes the item. A 401 is logged with the status code so it shows up in dev builds.

### PitchGlides exercise — microphone unavailable
**Where:** `PitchGlidesExercise ExerciseScreen`
**Trigger:** `getUserMedia` denied, WebView load error, or HTTP error from WebView host
**Mechanism:** WebView posts `{ error: message }` on JS failure; `onError` / `onHttpError` props set `micError = true`
**Fallback:** Full-screen overlay: "Microphone unavailable" message + **Skip this exercise** button

### Speech Enhancement — backend cold start
**Where:** `AuthContext.warmUpBackend()`
**Trigger:** Render free tier spun down after 15 min idle
**Mechanism:** Non-blocking `GET /` ping on every app open (10 s abort timeout). Backend wakes up during auth resolution before the user's first real API call.
**Fallback:** If the ping itself fails, the first real call might be slow (30–60 s). `SpeechEnhancementScreen` shows a spinner during processing so the user is not left looking at a blank screen.

### Voice clone fails
**Where:** `voiceService.cloneVoice()` / `AssessmentScreen`
**Trigger:** ElevenLabs API error or network failure
**Mechanism:** Clone failure is non-fatal — assessment completes and assessment data is still saved
**Fallback:** Speech Enhancement works without a voice clone (falls back to a generic voice or ElevenLabs default)

### ElevenLabs quota exhausted
**Where:** `backend/api/voice_routes.py` → `backend/services/voice_service.py`
**Trigger:** Monthly character quota on the ElevenLabs free/starter plan exceeded; API returns HTTP 429 or quota-specific error body
**Mechanism:** `isQuotaError()` helper in `voice_service.py` detects quota responses and sets a `quota_exceeded` flag in the response. The frontend `VoiceSetupExercise` checks this flag and shows a graceful "Voice personalisation unavailable right now" message, then allows the user to skip setup.
**Fallback:** User bypasses voice cloning; Speech Enhancement uses the ElevenLabs default voice. Assessment and training sessions continue normally.
**Action:** Upgrade ElevenLabs plan or wait for monthly reset. No code change needed.

### Voice analysis endpoint fails (baseline session)
**Where:** `ReadingMiniExercise.analyzeRecording()` / `PitchGlideMiniExercise.analyzeRecording()`
**Trigger:** Network failure, backend 5xx, or 12-second abort timeout on `/api/analyze-voice`
**Mechanism:** Both mini-exercises have a 12-second abort controller on the analysis fetch. Any failure (network, timeout, non-2xx) is caught silently.
**Fallback:** `onComplete(null)` is called — the baseline session records a null score for that dimension rather than blocking. The user is not shown an error; they flow to the next exercise as normal.
**Note:** A null score means that dimension is excluded from the composite average. The baseline can still complete and produce a progress plan from whichever scores did land.

### Network offline (global)
**Where:** `OfflineBanner` component, mounted in `AppNavigator.js`
**Trigger:** `@react-native-community/netinfo` reports `isConnected: false`
**Mechanism:** `NetInfo.addEventListener` subscription updates a context value; `OfflineBanner` renders a persistent yellow banner at the top of every screen when offline.
**Fallback:** Banner is purely informational — it does not block navigation. API calls still proceed and will fail with network errors, triggering their normal per-feature fallbacks. This gives the user clear context for why requests are failing.

### 401 token expiry mid-session (resolved automatically)
**Where:** `frontend/src/utils/authHeaders.js` → `fetchWithAuth()`
**Trigger:** Firebase ID tokens expire after 1 hour. Any API call made after expiry returns HTTP 401.
**Mechanism:** `fetchWithAuth` intercepts 401, calls `auth.currentUser.getIdToken(true)` to force-refresh, then retries the original request once with the new token. Transparent to all callers.
**Fallback:** If the refresh also fails (user revoked, signed out on another device), the retry also returns 401. At that point the per-feature error handling takes over (e.g. exercise advances leniently, save shows Alert with retry).

### Backend transient errors (503/504)
**Where:** `frontend/src/utils/authHeaders.js` → `fetchWithAuth()`
**Trigger:** Render backend temporarily unavailable during a deploy, cold-start race, or brief overload
**Mechanism:** `fetchWithAuth` retries up to 2 times with delays of 1s then 2s before propagating the error. Covers Render cold-start (typically resolves within 15s) and brief 503 blips.
**Fallback:** After 2 retries (~3s total), error propagates to the per-feature handler (spinner dismissed, Alert shown, or exercise advances leniently depending on context).

---

## Global JS Exception Boundary

**Where:** `AppNavigator.js` wraps `<NavigationContainer>` in `<ErrorBoundary>`
**Trigger:** Uncaught JavaScript exception during React render
**Fallback:** Full-screen "Something went wrong" screen with a **Try Again** button that resets the boundary state. Prevents white crash screens.

---

## Fallback Route Map

| Scenario | What the user sees | Where they can go |
|---|---|---|
| Firebase hangs on startup (15 s) | Splash + "Trouble restoring session" banner | Sign In / Sign Up buttons |
| Network totally offline | Yellow OfflineBanner at top of screen + per-screen errors | Retry when reconnected |
| 401 expired token | Transparent auto-refresh — user sees nothing | Request succeeds after token refresh |
| Backend 503/504 transient | Transparent auto-retry (1s, 2s delays) | Request succeeds or triggers per-feature fallback |
| Backend cold start (first request slow) | Spinner / processing indicator | Wait; warm-up ping reduces frequency |
| Assessment save fails | Back to results screen + Alert | Retry save or Continue to Home |
| Check-in save fails | Alert with options | Retry or Go Home |
| Progress screen load fails | Error message + Retry button | Tap Retry |
| Home roadmap load fails | Orange retry banner | Tap banner |
| FunctionalSpeech 401 | Exercise advances leniently | Continues normally |
| PitchGlides mic denied | "Microphone unavailable" overlay | Skip exercise |
| Baseline analysis fails (ReadingMini / PitchGlideMini) | Silent null score — user sees "Analysing…" then moves on | Continues to next exercise |
| ElevenLabs quota exhausted | "Voice personalisation unavailable" message in VoiceSetupExercise | Skip voice setup; training continues without personalised voice |
| Any uncaught JS crash | "Something went wrong" screen | Try Again |

---

## Pending (not yet implemented)

The following improvements are noted for a future release:

| Item | Priority | Notes |
|---|---|---|
| ~~NetInfo offline detection~~ | ~~Medium~~ | ✅ **Implemented 2026-07-19** — `OfflineBanner` component + `@react-native-community/netinfo` subscription in `AppNavigator.js` |
| ~~Retry with exponential backoff~~ | ~~Medium~~ | ✅ **Implemented 2026-07-19** — `fetchWithAuth` retries 503/504 with delays `[1000, 2000]` ms before propagating error |
| ~~401 auto-refresh on frontend~~ | ~~Medium~~ | ✅ **Implemented 2026-07-19** — `fetchWithAuth` intercepts 401, force-refreshes token, retries once |
| Sentry / crash reporting | Low | Wire `componentDidCatch` in `ErrorBoundary` and silent `catch` blocks to a crash reporter for production observability. |
| iOS/Android push notifications | Low | Daily training reminders. Requires `expo-notifications` + server-side FCM integration. |
| audioCues wiring | Low | `useAudioCues()` hook exposed but not wired to actual audio file playback. Files needed: `correct.mp3`, `exercise_complete.mp3`, `session_complete.mp3`. |
