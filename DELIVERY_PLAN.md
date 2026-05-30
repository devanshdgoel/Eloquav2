# Eloqua — Technical Delivery Plan
**Solo dev · May 9–31, 2026 · Target: iOS App Store submission**

---

## 1. What Exists and Works

**Frontend (React Native / Expo SDK 54)**

- `splash/SplashScreen.js` + sub-components (`DolphinAnimation`, `BrandReveal`, `SplashButtons`) — full animated splash with guest/auth branching
- Auth: `SignUpScreen`, `SignInScreen` — Firebase email/password, complete with validation and routing
- Onboarding: `PersonaliseScreen` → `SetupPermissionsScreen` → `AboutYouIntroScreen` → `SetupAboutYouScreen` → `SetupVoiceScreen` — full 5-screen flow, voice cloning wired
- `OpeningScreen` — personalized time-of-day greeting, auto-navigates to Home
- `HomeScreen` — 20-node sine-wave SVG roadmap, streak pill, floating Speech card, bottom tab nav (Home / Progress / Settings)
- `SpeechEnhancementScreen` — full pipeline: expo-av recording → POST /api/process-audio → playback + share. Amoeba blob animation during recording.
- `SpeechDemoScreen` — unauthenticated wrapper around above
- `VocalTrainingSessionScreen` — 8-exercise fixed sequence, animated progress bar, calls `completeSession()` on finish, routes to StreakCelebration
- Exercises (all structurally complete): `BreathingExercise`, `SustainedPhonationExercise` (adaptive mic threshold per session), `LoudnessDrillsExercise` (whack-a-jellyfish, 5 whacks to complete), `FunctionalSpeechExercise` (hear-and-repeat, calls /api/process-audio for scoring), `PitchGlidesExercise` (pitch-control dolphin)
- `StreakCelebrationScreen` + `StreakCommitmentScreen` — milestone-aware animations, haptics
- `ProgressScreen` — ring chart, 3 stat cards, 6 achievement badge placeholders (all hardcoded locked)
- `SettingsScreen` — sign-out / exit guest

**Backend (FastAPI / Render)**

- `POST /api/process-audio` — Whisper STT → GPT-4 clarity edit (Parkinson's-tuned prompt) → ElevenLabs TTS → returns transcript + audio URL. Voice profile matching (3×3 pitch×speed grid, 9 ElevenLabs voices).
- `GET /api/audio/{filename}` — file serving with path-traversal protection
- `POST /api/voice/clone`, `GET /api/voice/status`, `DELETE /api/voice/clone` — ElevenLabs Instant Voice Clone, voice_id stored in Firestore

**Infrastructure**

- Firebase Auth + Firestore: user profiles, voice_id, progress (current_node, streak_days, sessions_completed)
- EAS project configured (`f4bb8d13-0817-4c35-af80-dd6c71b42002`), `app.config.js` wired, Android preview/production profiles defined

---

## 2. Partial or Broken

| Item | File | Status |
|---|---|---|
| `TailoredExercise` | `exercises/TailoredExercise.js` | DONE — V2: adaptive tier selection + baseline focus tie-breaking |
| Achievement badges | `ProgressScreen.js` | Remaining — hardcoded `unlocked: false`, not yet wired to Firestore |
| `PitchGlidesExercise` | `exercises/PitchGlidesExercise.js` | DONE — V2: replaced native module with WebView + Web Audio API autocorrelation |
| `/api/process-audio` auth check | `api/speech_routes.py` | DONE — V3: all routes auth-gated via Firebase Bearer token (V3.1) |
| EAS iOS build | `eas.json` | DONE — `ios-preview` profile added (V3) |
| App Store config | `app.config.js` | DONE — `NSMicrophoneUsageDescription` added (V3) |
| Firestore rules | Firebase console | Remaining — still in test mode; must be deployed manually from Firebase console |
| Render cold starts | Render free tier | MITIGATED — health-check ping on auth state change warms backend (V3.5); upgrade to paid tier eliminates spin-down |
| Old splash screen | `screens/SplashScreen.js` | DONE — deleted (V3) |
| Dead backend code | `database.py`, `api/auth_routes.py`, `api/progress_routes.py` | DONE — all three deleted (V3.2) |

---

## 3. Missing Entirely

- Exercise performance persistence (no Firestore writes for phonation duration, loudness scores, etc.)
- Adaptive session logic using historical performance data
- Badge unlock events triggered by real milestones
- Google Sign-In and Apple Sign-In (both show "Coming soon" alert; Google needs `iosClientId`, Apple needs entitlement)
- Privacy Policy and Terms of Service pages/URLs (App Store requirement)
- App Store assets: 1024×1024 icon, 6.7" iPhone screenshots, app description, keywords, content rating
- Stroke-trained / dysarthric-speech ASR to replace or supplement Whisper
- Streaming TTS playback (currently saves full file before playback)

---

## 4. Sprint Plan: May 9–31

**~15 working days. Grouped into three hard-edged blocks.**

---

### Block A — May 9–15: Speech pipeline + backend security (7 days)

**Day 1–2: Auth gate on /api/process-audio**
- Frontend: pass Firebase ID token as `Authorization: Bearer <token>` header from `SpeechEnhancementScreen` and `FunctionalSpeechExercise`
- Backend: add `get_current_user` dependency (already in `utils/auth_dep.py`) to the `process_audio` route
- Return 401 for unauthenticated callers; guest users route to demo endpoint only

**Day 3: Render upgrade + backend hygiene**
- Upgrade Render to Starter ($7/mo) — eliminates cold start spin-down
- Delete `database.py`, `api/auth_routes.py`, `api/progress_routes.py` (dead code)
- Delete `screens/SplashScreen.js` (old duplicate)

**Day 4–5: Latency reduction**
- Current sequential flow: Whisper (~2 s) → GPT-4 (~1.5 s) → ElevenLabs (~2 s) = ~5–6 s RTT
- Parallelize: run `clarity_transcript()` and `analyze_voice()` concurrently with `asyncio.gather()` after Whisper returns
- Return transcript to frontend immediately as a partial response (SSE or two-phase JSON: `{transcript}` first, then `{audio_url}`)
- Frontend `SpeechEnhancementScreen`: show cleaned transcript while audio is still loading
- Target: user sees text in ~3 s, audio ready in ~5 s (from ~7 s perceived today)

**Day 6–7: Stroke-trained ASR**
- OpenAI Whisper (whisper-1) is general-purpose and degrades on dysarthric speech
- Integrate a Whisper model fine-tuned on dysarthric/Parkinson's data (Hugging Face: `Jzuluaga/whisper-large-v3-atco2-asr-atcosim` is a structural reference; target is a dysarthric fine-tune such as `facebook/wav2vec2-large-960h` fine-tuned on TORGO dataset, or the `stt_en_conformer` dysarthria models)
- Decision gate: if a suitable hosted API exists (e.g., HuggingFace Inference API), wire it as a fallback after Whisper confidence is low. If not, run a parallelized A/B call (Whisper + dysarthric model), pick higher-confidence output
- If no viable hosted model by Day 7: document the gap, keep Whisper, mark as post-launch

---

### Block B — May 16–23: Vocal training adaptive logic + UI (8 days)

**Day 8–9: Exercise performance persistence**
- Add Firestore writes at end of each exercise: `users/{uid}/exerciseHistory/{sessionId}/{exerciseType}` with `{ score, timestamp, exerciseType }`
- `SustainedPhonationExercise`: write `bestScore` (seconds)
- `LoudnessDrillsExercise`: write `whacksLanded` out of 5
- `FunctionalSpeechExercise`: write `itemsCorrect` out of 5
- `PitchGlidesExercise`: write `hoopsCompleted` out of total

**Day 10: Adaptive TailoredExercise**
- On session start, `VocalTrainingSessionScreen` fetches last 3 sessions' exercise scores from Firestore
- `TailoredExercise` receives a `weakestExercise` prop (the type with lowest normalised score)
- If insufficient history (<3 sessions): fall back to random as today
- This replaces the `Math.random()` selection in `TailoredExercise.js`

**Day 11: ProgressScreen badges**
- Wire the 6 badge conditions to real Firestore data from `fetchProgress()`:
  - "First Breath": `sessions_completed >= 1`
  - "Week Warrior": `streak_days >= 7`
  - "Vocal Champion": `sessions_completed >= 10`
  - "Dolphin Diver": `current_node >= 7` (Level 1 complete)
  - "Consistency": `streak_days >= 30`
  - "Voice Master": `sessions_completed >= 20`
- Remove all hardcoded `unlocked: false`

**Day 12: PitchGlidesExercise fix**
- Option A: Replace `react-native-pitch-detector` with pitch estimation from expo-av metering (autocorrelation on RMS values — approximate but no native module). Acceptable for clinical-grade training.
- Option B: Defer PitchGlides to post-launch and substitute a second Breathing round in the session sequence
- Decision: go with Option A unless autocorrelation accuracy is insufficient after a 2-hour spike

**Day 13–14: UI consistency pass**
- Audit every screen for inline hex values not sourced from `src/theme/index.js`
- Replace: orange `#FFA940` / `#FE9C2D` → `theme.colors.accent`, teal variants → `theme.colors.teal*`, mint → `theme.colors.mint`
- Spacing and border-radius: replace magic numbers with `theme.spacing.*` and `theme.borderRadius.*`
- Typography: replace inline `fontSize`/`fontWeight` combos with `theme.typography.*` entries (add if missing)
- Target: no raw hex or magic spacing number appears in any screen file

**Day 15: Firestore security rules**
- Lock down: users can only read/write their own `users/{uid}` document and sub-collections
- Progress/exercise history: write-only from authenticated user, read only by that user
- Voice routes: add the Firebase auth dependency to all three voice endpoints in `voice_routes.py`

---

### Block C — May 24–31: App Store prep (7 days)

**Day 16–17: New onboarding screens**
Three screens to add before the existing onboarding gate:
1. `WhatIsEloquaScreen` — "Parkinson's affects how you speak. Eloqua trains your voice daily." (one illustration, one CTA)
2. `HowItWorksScreen` — three-step overview: Train → Speak → Improve (icon row)
3. `VoiceCloningExplainerScreen` — explain why voice samples are collected and how they're used (privacy-first framing). Required for App Store review plausibility.

Wire into `AppNavigator.js` before `Personalise` for new users only.

**Day 18: App Store assets**
- 1024×1024 PNG app icon (no alpha, no rounded corners — Apple applies the mask)
- 6.7" iPhone screenshots: min 3, target 5–6 (Splash, Home roadmap, Speech Enhancement, one exercise, ProgressScreen)
- App description (≤4000 chars), subtitle (≤30 chars), keywords (≤100 chars)
- Privacy Policy URL (required — host a simple Notion or GitHub Pages page)
- Content rating questionnaire answers (medical app, no user-generated content)
- Age rating: 4+

**Day 19: iOS EAS build config**
- Add `ios` profile to `eas.json`:
  ```json
  "ios-preview": {
    "distribution": "internal",
    "ios": { "simulator": false }
  }
  ```
- Add `ios.infoPlist` to `app.config.js`:
  ```js
  NSMicrophoneUsageDescription: "Eloqua needs the microphone to record your voice for training and speech enhancement."
  ```
- Add `NSCameraUsageDescription` if any screen uses camera (check; otherwise omit)
- Configure Apple credentials in EAS (Apple ID, team ID, provisioning profile)

**Day 20–21: TestFlight build + smoke test**
- Run `eas build --platform ios --profile ios-preview`
- Submit to TestFlight internal group
- Smoke test all golden paths on a physical iPhone: onboarding → voice clone → home → speech enhancement → vocal training session → streak celebration
- Fix any device-specific issues (safe area, font rendering, audio session conflicts)

**Day 22: Production EAS build**
- Run `eas build --platform ios --profile production`
- Submit via `eas submit --platform ios` or App Store Connect upload
- Complete App Store Connect listing (screenshots, description, privacy policy URL, support URL)

---

### Session 4 (2026-05-30): Auth, Account Management, Onboarding

The following items from the sprint plan were completed in Session 4:

**From Block A:**

- **Auth gate on all backend routes (Day 1–2):** Complete. `get_current_user` dependency applied to all routes in `speech_routes.py`, `analysis_routes.py`, `assessment_routes.py`, and `voice_routes.py`. `user_id` form params removed; UID derived from verified token. Frontend `getAuthHeaders()` utility added (`frontend/src/utils/authHeaders.js`). All screens updated.
- **Delete dead backend code (Day 3):** Complete. `database.py`, `api/auth_routes.py`, `api/progress_routes.py` deleted.
- **Delete old splash screen (Day 3):** Complete. `screens/SplashScreen.js` removed.

**From Block C:**

- **New onboarding screens (Day 16–17):** Complete. `WhatIsEloquaScreen`, `HowItWorksScreen`, `VoiceCloningExplainerScreen` added. Wired into `AppNavigator.js` for new users only.
- **iOS EAS build config (Day 19):** Complete. `ios-preview` profile added to `eas.json`. `NSMicrophoneUsageDescription` added to `app.config.js`.

**Additional (not in original plan):**

- **Password reset:** `sendPasswordResetEmail` added to `authService.js`; "Forgot password?" link added to `SignInScreen.js`.
- **Account deletion:** `DELETE /api/account` endpoint added. Full cascade delete: Firestore docs → ElevenLabs voice → Firebase Auth account. `SettingsScreen` wired with two-step confirmation.
- **Cold start health check:** `AuthContext.js` pings `GET /api/health` on auth state change. `AppNavigator` shows non-blocking "Connecting to server…" indicator.

**Items from original sprint plan still open:**

| Item | Block | Notes |
|---|---|---|
| Render upgrade to paid tier | Block A Day 3 | Cold start mitigated via health ping; upgrade still recommended before launch |
| Latency reduction (SSE / parallel calls) | Block A Day 4–5 | Not yet implemented |
| Stroke-trained ASR (SONIVA) | Block A Day 6–7 | SONIVA toggle exists in Settings; fine-tuned model not yet integrated |
| ProgressScreen achievement badges | Block B Day 11 | Still hardcoded `unlocked: false` |
| UI theme consistency pass | Block B Day 13–14 | Partial; inline hex values may remain in newer screens |
| Firestore security rules | Block B Day 15 | Must be deployed from Firebase console — not a code change |
| App Store assets | Block C Day 18 | Screenshots, description, keywords, Privacy Policy URL not yet prepared |
| TestFlight build + smoke test | Block C Day 20–21 | Apple credentials not yet configured in EAS dashboard |
| Production EAS build + submission | Block C Day 22 | Blocked on TestFlight smoke test |

---

## 5. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ElevenLabs latency spikes (>4 s TTS) | Medium | High | Cache synthesized audio for repeated phrases; parallelize clarity + TTS |
| Stroke-trained ASR not available as hosted API | High | Medium | Accept Whisper + clinical prompt for v1; flag as v1.1 improvement |
| PitchGlidesExercise autocorrelation inaccurate | Medium | Low | Substitute second Breathing round; pitch training is supplementary |
| Apple App Store review rejection (microphone, medical claims) | Medium | High | Avoid "treats Parkinson's" language; use "supports therapy" framing; Privacy Policy ready before submission |
| Render cold start after upgrade still slow | Low | Medium | Upgrade resolves spin-down; add health-check ping from frontend on app open |
| Firebase Firestore security rules misconfigured | Low | High | Test rules thoroughly with Firebase Emulator before deploy |
| Solo dev time slippage on Block C | Medium | High | Block C is parallelizable with App Store assets (async work); TestFlight is gate, not polish |

---

## 6. Out of Scope (May 31)

- Android Play Store submission (EAS Android build is configured but store listing is not)
- Google Sign-In and Apple Sign-In (placeholder alerts remain)
- Leaderboards and social features (noted in ProgressScreen "coming soon")
- Detailed analytics dashboard (ElevenLabs/Whisper usage costs, per-user session trends)
- Self-hosted dysarthric ASR model (requires GPU infrastructure beyond Render)
- Push notifications / daily training reminders
- Offline mode
- Backend test CI/CD pipeline
- Multi-language support
