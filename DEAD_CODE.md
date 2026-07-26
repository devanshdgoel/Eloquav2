# Dead Code Register

Files that exist in the repo but are no longer referenced from any active
navigation path or import chain. Kept for reference; not safe to delete
without a product decision.

---

## Screens removed from AppNavigator (fix/a11y-polish, 2026-07-26)

### `frontend/src/screens/AssessmentScreen.js`
- **Why removed:** No `navigate('Assessment')` call exists anywhere in the
  active codebase. Baseline voice assessment is now handled entirely by
  `BaselineSessionScreen.js` (navigated to via `DailyVoiceNote → BaselineSession`).
  AssessmentScreen was the original v1 baseline flow and was never wired into
  the current v2 navigation tree.
- **Action required:** Confirm with product that this screen will not be
  restored before deleting the file.

### `frontend/src/screens/SpeechDemoScreen.js`
- **Why removed:** No `navigate('SpeechDemo')` call exists in the active
  codebase. This was an unauthenticated demo of the speech enhancement feature,
  intended to be accessible from HomeScreen, but the HomeScreen link was never
  added to the final design.
- **Action required:** Decide whether the demo flow should be re-implemented
  (e.g. as a guest-mode entry point from the Splash screen) or deleted.

---

## Orphaned screens — never in AppNavigator (pre-existing)

These two files were already orphaned before this branch. They are kept as
backup starting points for future screens and must NOT be edited unless
explicitly requested.

| File | Notes |
|------|-------|
| `frontend/src/screens/onboarding/AboutYouIntroScreen.js` | No navigator entry, no navigate() call. Backup for future onboarding redesign. |
| `frontend/src/screens/onboarding/PersonaliseScreen.js` | No navigator entry, no navigate() call. Backup for future personalisation flow. |

---

## Screens kept despite no current navigate() calls

These screens are registered in AppNavigator but have no active navigate()
calls pointing to them from the current app flow. They are intentionally kept:

| Screen | Reason kept |
|--------|-------------|
| `WhatIsEloquaScreen` | Backup for a future "About Eloqua" entry point from Settings. Forms a chain with HowItWorks → VoiceCloningExplainer. |
| `HowItWorksScreen` | Same chain. Only navigated to from WhatIsEloquaScreen. |
| `VoiceCloningExplainerScreen` | Same chain. Only navigated to from HowItWorksScreen. |
| `SetupVoiceScreen` | Referenced in `SettingsScreen_full.js` (inactive full settings). Kept for when the full settings screen is restored. |
