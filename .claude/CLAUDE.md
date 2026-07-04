# Eloqua – Codebase Guide

## Folder Structure

```
Eloquav2/
├── frontend/                   # React Native / Expo app (all user-facing code lives here)
│   ├── src/
│   │   ├── screens/            # One file per screen; sub-folders group related screens
│   │   ├── navigation/         # AppNavigator.js – the single Stack navigator for the whole app
│   │   ├── components/         # Small shared UI pieces (ErrorBoundary, LoadingSpinner, CantDoNow)
│   │   ├── context/            # React context providers (AuthContext, PrefsContext)
│   │   ├── services/           # API calls and Firebase helpers (authService, progressService, difficultyService)
│   │   ├── utils/              # Pure helpers (analytics, authHeaders, storage)
│   │   ├── config/             # App-level config (firebase.js, env.js)
│   │   ├── theme/              # Design tokens – colors, spacing, typography (index.js is the single source of truth)
│   │   └── resources/          # Static assets referenced in JS (e.g. Dolphin2.png)
│   ├── assets/                 # Images, fonts, and other static files bundled by Expo
│   ├── App.js                  # Root component; mounts AppNavigator inside PrefsProvider
│   ├── app.config.js           # Expo config (app name, bundle id, iOS Privacy Manifest, plugins)
│   └── package.json            # JS dependencies
│
├── backend/                    # FastAPI Python server
│   ├── api/                    # Route modules; each file = one feature area
│   ├── services/               # Business logic called by route modules
│   ├── utils/                  # Shared utilities (auth dependency, validators, responses)
│   ├── main.py                 # FastAPI app entry point; registers all routers
│   ├── firebase_config.py      # Firebase Admin SDK initialisation
│   └── config.py               # Env-var driven config (API keys, CORS origins)
│
├── .claude/                    # Claude Code configuration and this guide
├── .expo/                      # Expo CLI cache (do not edit)
├── node_modules/               # Root-level JS dependencies (mostly Expo CLI)
└── *.md                        # Project documentation (Pilot1.0.md, ERROR_HANDLING.md, etc.)
```

---

## Screen Inventory

All screens in the app are rendered through a **single flat Stack navigator** defined in:

```
frontend/src/navigation/AppNavigator.js
```

### Screens registered in AppNavigator (navigator name → file path)

| Navigator name         | File path                                                                 | Notes                                      |
|------------------------|---------------------------------------------------------------------------|--------------------------------------------|
| `Splash`               | `frontend/src/screens/splash/SplashScreen.js`                             | First screen; decides auth routing         |
| `SignUp`               | `frontend/src/screens/onboarding/SignUpScreen.js`                         | Email + password registration              |
| `SignIn`               | `frontend/src/screens/onboarding/SignInScreen.js`                         | Email login                                |
| `WhatIsEloqua`         | `frontend/src/screens/onboarding/WhatIsEloquaScreen.js`                   | Onboarding explainer (currently unused in flow) |
| `HowItWorks`           | `frontend/src/screens/onboarding/HowItWorksScreen.js`                     | Onboarding explainer (currently unused in flow) |
| `VoiceCloningExplainer`| `frontend/src/screens/onboarding/VoiceCloningExplainerScreen.js`          | Onboarding explainer (currently unused in flow) |
| `SetupPermissions`     | `frontend/src/screens/onboarding/SetupPermissionsScreen.js`               | Mic / notification permission request      |
| `SetupAboutYou`        | `frontend/src/screens/onboarding/SetupAboutYouScreen.js`                  | Name + age collection                      |
| `SetupVoice`           | `frontend/src/screens/onboarding/SetupVoiceScreen.js`                     | 3-sentence voice recording for voice clone |
| `Opening`              | `frontend/src/screens/OpeningScreen.js`                                   | Welcome-back screen for returning users    |
| `Home`                 | `frontend/src/screens/HomeScreen.js`                                      | Sine-wave roadmap; main hub               |
| `Settings`             | `frontend/src/screens/SettingsScreen.js`                                  | User preferences and account actions       |
| `Progress`             | `frontend/src/screens/ProgressScreen.js`                                  | Milestone / badge history                  |
| `Assessment`           | `frontend/src/screens/AssessmentScreen.js`                                | Baseline voice assessment (node 0)         |
| `Checkin`              | `frontend/src/screens/CheckinScreen.js`                                   | Progress check-in; triggers difficulty adj |
| `SpeechEnhancement`    | `frontend/src/screens/SpeechEnhancementScreen.js`                         | Record → enhance → play back speech        |
| `SpeechDemo`           | `frontend/src/screens/SpeechDemoScreen.js`                                | Unauthenticated demo of speech enhancement |
| `VocalTrainingSession` | `frontend/src/screens/vocaltraining/VocalTrainingSessionScreen.js`        | Hosts the exercise components in sequence  |
| `StreakCelebration`    | `frontend/src/screens/StreakCelebrationScreen.js`                          | Shown after a streak milestone             |
| `StreakCommitment`     | `frontend/src/screens/StreakCommitmentScreen.js`                           | Commitment pledge screen                   |

### Sub-components inside screens/ that are NOT registered in the navigator

These files live under `screens/` but are rendered as child components, not as top-level routes. Do not add them to the navigator.

| File path                                                                              | Used by                        |
|----------------------------------------------------------------------------------------|--------------------------------|
| `frontend/src/screens/splash/BrandReveal.js`                                           | `SplashScreen.js`              |
| `frontend/src/screens/splash/DolphinAnimation.js`                                      | `SplashScreen.js`              |
| `frontend/src/screens/splash/SplashButtons.js`                                         | `SplashScreen.js`              |
| `frontend/src/screens/vocaltraining/exercises/TailoredExercise.js`                     | `VocalTrainingSessionScreen.js`|
| `frontend/src/screens/vocaltraining/exercises/BreathingExercise.js`                    | `VocalTrainingSessionScreen.js`|
| `frontend/src/screens/vocaltraining/exercises/SustainedPhonationExercise.js`           | `VocalTrainingSessionScreen.js`|
| `frontend/src/screens/vocaltraining/exercises/LoudnessDrillsExercise.js`               | `VocalTrainingSessionScreen.js`|
| `frontend/src/screens/vocaltraining/exercises/PitchGlidesExercise.js`                  | `VocalTrainingSessionScreen.js`|
| `frontend/src/screens/vocaltraining/exercises/DolphinVowelsExercise.js`                | `VocalTrainingSessionScreen.js`|
| `frontend/src/screens/vocaltraining/exercises/FunctionalSpeechExercise.js`             | `VocalTrainingSessionScreen.js`|
| `frontend/src/screens/vocaltraining/exercises/MidpointScreen.js`                       | `VocalTrainingSessionScreen.js`|

### DUPLICATES TO RESOLVE

None detected — every screen filename is unique across the repo. However, two onboarding files exist in `screens/onboarding/` but are **not wired to any navigator route** and are never navigated to from anywhere in the codebase. They are effectively dead code:

```
frontend/src/screens/onboarding/AboutYouIntroScreen.js   ← ORPHANED (no navigator entry, no navigate() call points here)
frontend/src/screens/onboarding/PersonaliseScreen.js      ← ORPHANED (no navigator entry, no navigate() call points here)
```

Before editing either of those files, verify the intention: are they planned future screens, or should they be deleted?
They are backup screens for the future. Do not need to delete them but never edit these files unless explicitly mentioned.

---

## Backend Structure

The backend is a **FastAPI** application whose entry point is `backend/main.py`. On startup it calls `initialize_firebase()` (from `firebase_config.py`) to boot the Firebase Admin SDK, then registers five routers all mounted under the `/api` prefix: `speech_router` (POST `/process-audio`, `/transcribe-chunk`, `/enhance-text`), `audio_router` (GET `/audio/{filename}` for serving enhanced audio files), `voice_router` (POST/GET/DELETE `/voice/clone` and `/voice/status` for ElevenLabs voice cloning), `analysis_router` (POST `/analyze-voice`, GET `/voice-history`), and `assessment_router` (POST `/save-assessment`, POST `/complete-session`, GET `/progress-data`, DELETE `/account`). Each router file in `backend/api/` delegates business logic to a matching module in `backend/services/` (e.g. `speech_routes.py` calls `speech_service.py` and `clarity_speech.py`). Shared concerns live in `backend/utils/`: `auth_dep.py` exports the `get_current_user` FastAPI dependency that verifies Firebase ID tokens on every protected route, `file_handler.py` manages temp audio files, and `validators.py` / `responses.py` provide input validation and consistent JSON shapes. Config is environment-variable driven via `backend/config.py` (reads `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ALLOWED_ORIGINS`, etc.). Run locally with `uvicorn main:app --reload` from the `backend/` directory.

---

## Conventions

**Apply these rules to every future edit in this repo, both JavaScript and Python.**

1. **Write simple, readable code.** Prefer clear multi-step logic over compact expressions. A reader should understand what a block does without running it mentally. If a line needs a comment to be understood, rewrite the line first; only add the comment if rewriting makes it worse.

2. **No clever one-liners.** Chained ternaries, nested comprehensions, and deeply piped expressions are forbidden unless the alternative is genuinely more complex. One thought per line.

3. **Add extensive comments explaining the "what" and especially the "why".** Every function must have a short comment at its top describing what it does and why it exists. Every non-trivial block inside a function must have a comment explaining what it's doing and the reason for any non-obvious decision (e.g. why a particular threshold was chosen, why a fallback path exists, why a certain state transition happens here). Comments should be written so a developer who is new to the codebase can understand the code without tracing through other files.

   ```js
   // Good – explains what and why
   // We clamp current_node to [0, TOTAL_NODES-1] before indexing NODE_DEFS
   // because Firestore can return a stale value if a session completes mid-update.
   const safeNode = Math.max(0, Math.min(currentNode, TOTAL_NODES - 1));
   ```

   ```js
   // Bad – says nothing useful
   const safeNode = Math.max(0, Math.min(currentNode, TOTAL_NODES - 1)); // clamp
   ```

4. **Keep functions short.** If a function is longer than ~40 lines it probably does more than one thing. Extract helpers with descriptive names.

5. **Design tokens from theme/index.js only.** Never hard-code colors, font sizes, spacing, or border-radius values inside screen or component files. Import from `../theme` (or the correct relative path) and use the exported tokens.

---

## Before Editing Any Screen

**Always follow these steps before touching a screen file:**

1. **Grep the whole repo for the component name.**
   ```
   # Example: before editing anything related to "CheckinScreen"
   grep -r "CheckinScreen" frontend/src --include="*.js"
   ```
   This reveals every file that imports or references that component.

2. **Confirm which file the navigator actually renders.** Open `frontend/src/navigation/AppNavigator.js` and find the `<Stack.Screen name="..." component={...} />` entry. The `component` prop is the canonical file. Only edit that file.

3. **Check for orphaned duplicates.** If the grep returns more than one `.js` file that *defines* a component with that name, stop. Flag both paths here in this document under "DUPLICATES TO RESOLVE" before making any changes.

4. **Only edit the file confirmed in step 2.** Never edit a file just because its filename matches — verify the navigator wiring first.
