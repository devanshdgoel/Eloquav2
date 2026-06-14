# Eloqua — Accessibility & Cognitive Ease

*Target users: stroke and Parkinson's disease patients who may experience fatigue, reduced motor precision, slower processing speed, aphasia, and emotional vulnerability around their voice.*

*Last updated: 2026-06-05*

---

## Design Principles

Every screen was built with these constraints in mind:

| User need | Design response |
|-----------|-----------------|
| Fatigue | Short sessions (8 exercises ≈ 15 min), mid-session rest card, no mandatory re-tapping |
| Reduced motor precision | All primary buttons ≥ 56px tall, large tap targets, touch zones on skip/close controls |
| Slower processing | One action per screen, ≤ 2 instruction sentences, no time pressure, auto-advance |
| Aphasia | Zero clinical jargon in all user-facing text |
| Emotional vulnerability | Scores shown after narrative framing, no negative framing, warm copy throughout |

---

## Text & Readability

### Font Sizes

All text in the app is **≥ 16px** — the WCAG 2.1 minimum for body text. This was enforced globally in Session 6 with a full audit of all exercise and component screens. The SC scale factor (screen width / 402) is now only used for spacing, icon sizes, and decorative measurements — **never for text**.

| Context | Minimum size | Token |
|---------|-------------|-------|
| Hero numbers (score/countdown) | 128px | `type.score` |
| Screen titles | 38px | `type.h1` |
| Section headings | 24–32px | `type.h2`, `type.h3` |
| Sub-headings | 20px | `type.h4` |
| Body / instruction text | 17–18px | `type.body`, `type.bodyLg` |
| Secondary body / captions | **16px minimum** | `type.bodySm`, `type.caption` |
| Button labels (primary) | 18–20px | `type.button`, `type.buttonLg` |
| Icon button glyphs | 20–24px | `type.icon`, `type.iconLg` |
| Pill / badge labels | 16px | `type.pill` |

All sizes are defined in `frontend/src/theme/index.js` (`type` export) and must be referenced from there — never hardcoded in individual screens.

### Prior text fixes (Session 6 audit)

Previously these were below 16px and have been corrected:

| File | Properties fixed |
|---|---|
| `BreathingExercise.js` | pillText, stepNum, instrText (all were 11–15px) |
| `SustainedPhonationExercise.js` | tag, stepNum, scoreTagText, pillText, tapHint, goalHint, goalReached (11–15px) |
| `DolphinVowelsExercise.js` | badge.text, vowel label, subHint (12–14px) |
| `CantDoNow.js` | triggerText, body, skipSub, stayText (13–15px) |
| `PitchGlidesExercise.js` | micErrorBody, micErrorBtnText (15px) |
| `FunctionalSpeechExercise.js` | readyBtnText, phaseHint (SC-scaled, could drop below 16px) |

### Jargon Removal

All clinical terminology replaced with plain language throughout the app:

| Replaced | With |
|----------|------|
| Sustained Phonation | Sustained Sound |
| Loudness Drills | Voice Power |
| Functional Speech | Everyday Speech |
| Tailored Exercise | Your Exercise |
| Expression (score) | Pitch Variety |
| Fluency (score) | Speech Rhythm |
| F0 / fundamental frequency | Not shown to user |
| voice_power / expression / fluency (Firestore field names) | Hidden behind UI labels |

---

## Touch Targets & Motor Precision

### Design System Standards (Session 6)

All icon/close/back buttons are now standardized to the `ui.ghostBtn` pattern from `theme/index.js`:
- **56×56px** fixed size (not SC-scaled)
- **borderRadius: 28** (perfect circle)
- `rgba(255,255,255,0.10)` background, `rgba(255,255,255,0.20)` border

Orange help/info buttons use `ui.orangeBtn` (same 56×56/r28, #FFA940 background with shadow).

Primary CTA buttons use `ui.primaryBtn`:
- Full-width, `paddingVertical: 20`, `borderRadius: 28`, `#FFA940` with shadow
- Resulting height: **~58px** — above the 56px minimum for motor accessibility

### Button Heights

| Screen | Button | Height |
|--------|--------|--------|
| All screens | Close / back icon buttons | **56px** (fixed, standardized) |
| AssessmentScreen | Start My Journey / See My Progress | ~58px |
| CheckinScreen | Save & Begin, Finish, Tap to Record | ~58px |
| VocalTrainingSessionScreen | Back to Home (fallback) | ~58px |
| MidpointScreen | Keep going | ~58px |
| StreakCelebrationScreen | See your progress | ~58px |
| SignUpScreen | Create Account | ~58px |
| SignInScreen | Sign In | ~58px |
| SetupAboutYouScreen | Continue | ~58px |
| SpeechEnhancementScreen | Play, Copy, New recording, Try Again | ≥ 52px |

### Skip Zone (Dev Tool)

A hidden 100×100px touch zone in the bottom-right corner of `VocalTrainingSessionScreen` allows long-press (2s) to skip an exercise without scoring it. This is a developer testing tool — invisible to users.

---

## Session Flow Design

### "Guided Conversation" Structure

The 8-exercise session is designed to feel like a supportive coaching session, not a clinical test:

1. **Breathing** — calming reset to start (no tier, no scoring, pure parasympathetic reset)
2. **Sustained Sound** — voice warmup with simple tier targets
3. **Pitch Glides** — pitch range exercise with visual hoop targets
4. **Voice Power** — loudness drill with visual level targets
5. **Halfway There** — midpoint rest card: *"Breathe. You're doing great."*
6. **Breathing** — second reset, clinically recommended after every 3 consecutive exercises
7. **Your Exercise** — adaptive selection of the user's weakest area
8. **Everyday Speech** — sentence reading for functional generalisation

### Progress Feedback Within a Session

- Orange progress bar at the bottom of the screen fills as each exercise completes — no numbers, just visual momentum
- Between every skill exercise, a 1.5s warm message appears before advancing (see Motivational Messages below)

### No Time Pressure

No countdown timers appear in any exercise. Progress indicators exist (e.g. "Round 2 of 5") but they never count down. The user always controls their own pace.

---

## Automatic Behaviour (Reducing Cognitive Load)

### Auto-Stop Recordings

| Recording | Auto-stop |
|-----------|-----------|
| `sustained_a` in Assessment | Yes — silence detection after user has phonated triggers automatic stop |
| `reading` in Assessment | No — complex enough that user should control stop |
| Check-in recording (pre/post) | No — sentence reading, user controls stop after MIN_REC_S = 3s |
| SpeechEnhancement | No — open-ended, user controls stop |

Auto-stop uses dual thresholds: SPEAK_THRESHOLD (0.25 normalised dBFS) must be met for MIN_SPEAK_FRAMES (3 frames ≈ 240ms) before silence detection engages, then SILENCE_THRESHOLD (0.18) for SILENCE_FRAMES (≈22 frames ≈ 1.8s) triggers the stop. This prevents premature stops from breath pauses.

### Auto-Advance

- Assessment tasks advance automatically when recording stops (no "Next task" button)
- After each exercise completes, a brief encouragement message is shown for 1.5s and then the session auto-advances — no "Continue" tap required between exercises
- BreathingExercise auto-advances on its own timer

### Session Exit Protection

Back gestures and `onExit` taps mid-session show a confirmation alert (*"Leave session? Your progress won't be saved."*) with Stay / Leave options. This uses `navigation.addListener('beforeRemove')` which fires only on user-initiated back navigation (POP/GO_BACK actions) — programmatic navigation (REPLACE/RESET) is allowed through so session completion works normally.

---

## Loading States

All loading states include text alongside any spinner:

| Screen | Loading text |
|--------|-------------|
| AssessmentScreen — cloning | "Setting up your voice…" |
| AssessmentScreen — saving | "Saving your plan…" |
| SpeechEnhancementScreen — enhancing | "Polishing your words…" |
| CheckinScreen — analysing | "Analysing your voice…" |
| CheckinScreen — finishing | `ActivityIndicator` (no text, but only 1–2s) |

---

## Error Feedback (No User Blame)

Errors never imply the user did something wrong:

| Situation | Message |
|-----------|---------|
| No speech detected | *"Nothing heard — tap again when you're ready."* |
| Network error | *"Couldn't connect right now. Check your connection and try again."* |
| Playback error | *"Could not play the enhanced audio."* (factual, not blaming) |

---

## Motivational Copy

All motivational copy is warm and human, not corporate or clinical.

### After Each Exercise (Training Session)

Cycles through: *"Nicely done."* / *"That's the one."* / *"Your voice carried that."* / *"Well done."* / *"Keep going."*

Appears as a brief full-screen message (1.5s) between skill exercises. Not shown after breathing or the midpoint rest card (they have their own messaging).

### Midpoint Rest Card

> *"Breathe. You're doing great."*

### Session Complete (Fallback Screen)

> *"One session stronger."*

### StreakCelebrationScreen

Day-specific messages:

| Streak | Message |
|--------|---------|
| Day 1 | *"Welcome back, [name]. Every day you show up counts."* |
| Day 3 | *"Three days running. This is how progress happens."* |
| Day 7 | *"A full week. You're building something real."* |
| Multiple of 7 | *"[N] days. That's real commitment."* |
| Any other day | *"You kept it burning, [name]."* |

### Assessment Results (Baseline)

> *"That's your starting point. From here, every session moves it."*

### First Speech Enhancement Playback

The very first time a user plays their enhanced audio, an overlay message appears for 4 seconds:

> *"That's you — clearer, stronger. This is what we're working toward."*

Tracked via AsyncStorage (`eloqua_speech_first_play`) so it only shows once, ever.

### HomeScreen Greeting

Shown on every visit unless a check-in is due:

- First session ever: *"Welcome. Your voice journey starts here."*
- Returning user: *"Good to see you. Your voice is ready when you are."*

---

## Score Display (Never Negative)

### Framing Before Numbers

In `CheckinScreen` comparison phase, narrative leads before scores are shown:

- Improved: *"You improved!"* → *"Your scores went up after today's training. Every session is building something real."*
- Flat / declined: *"Keep going!"* → *"Consistency is what counts. Your voice is being strengthened with every session."*

Scores (arcs) are shown below the narrative, never first.

### Score Labels

Scores use plain-language labels:

| Raw dimension | User-facing label |
|---------------|-------------------|
| `voice_power` | Voice Power |
| `expression` | Pitch Variety |
| `fluency` | Speech Rhythm |

### Tier Change Display (Check-in)

Instead of raw tier numbers, the comparison screen shows per-exercise pill badges:
- ⬆ Phonation / ⬆ Pitch Glides (green pill, when tier goes up)
- ⬇ Loudness (amber pill, when tier drops)

Flat tiers show nothing — no message about staying the same.

---

## Adaptive Difficulty (Accessibility Impact)

### Why It Matters

Starting every user at tier 1 regardless of baseline skill would be patronising and demotivating for higher-functioning users. Starting at too high a tier would be discouraging.

### Assessment → Starting Tiers

After the baseline assessment, tier initialisation uses clinically calibrated thresholds. PD patients typically score 15–45 on voice_power; these thresholds ensure most new users start at tier 1–2 where they can succeed immediately and feel motivated.

### Between-Session Auto-Nudge

If a user scores ≥ 85% on an exercise across 3 consecutive sessions, their tier automatically bumps up the next time they open a session — no check-in required. If they score ≤ 40%, the tier steps down. This prevents both boredom and discouragement.

### TailoredExercise — Personalised Weakness Focus

When all exercise tiers are equal, the "Your Exercise" slot picks the exercise matching the user's weakest voice dimension at baseline — not alphabetically first. The user never needs to know this is happening.

---

## Data Privacy & Persistence

### Personal Sentence Durability

The personal sentence used in every check-in (for longitudinal voice comparison) is stored in both AsyncStorage (fast local reads) and Firestore (cloud backup). After a reinstall, it is automatically restored from Firestore so the user never has to re-enter it — important for maintaining valid longitudinal comparisons.

### Voice Data

- Audio is processed in memory and not stored persistently on-device
- Voice clones are stored on ElevenLabs' infrastructure, linked to the user's Firebase UID
- Firestore stores only derived scores (voice_power, expression, fluency) and exercise scores — not raw audio

---

## Accessibility Properties on Native Components

Key components include `accessibilityRole` and `accessibilityLabel`:

| Component | accessibilityRole | accessibilityLabel |
|-----------|-------------------|--------------------|
| HomeScreen Smart Speech card | `"button"` | `"Smart Speech — AI voice enhancement"` |
| HomeScreen Settings tab | `"button"` | `"Settings"` |
| HomeScreen Home tab | `"button"` | `"Home"` |
| HomeScreen Progress tab | `"button"` | `"Progress and rewards"` |
| MidpointScreen close button | — | `"Exit session"` |
| StreakCelebrationScreen continue | `"button"` | `"Continue to commitment screen"` |

---

## Design Tokens (Single Source of Truth)

All colours, spacing, radii, and typography now flow from `frontend/src/theme/index.js`. Key rules for new screens:

| Rule | Value |
|---|---|
| Secondary text opacity | `rgba(255,255,255,0.60)` |
| Faint/hint text opacity | `rgba(255,255,255,0.38)` |
| Card border | `rgba(195,222,206,0.18)` — mint at 18% |
| Card border radius | 16 |
| CTA button radius | 28 |
| Icon button size | 56×56, r28 |
| Primary orange | `#FFA940` — the only orange in the app |
| Error red | `#E05252` |
| Success green | `#48D28C` |

---

## What Is Not Yet Done

| Gap | Notes |
|-----|-------|
| VoiceOver / TalkBack full audit | Screen reader behaviour not fully tested. Arc score labels in CheckinScreen would be inaudible without `accessibilityLabel`. |
| Dynamic text scaling | The app uses fixed font sizes — good for minimum floor but does not respond to OS "Larger Text" accessibility setting. |
| High-contrast mode | No explicit high-contrast variant. The teal-on-dark theme has reasonable contrast but is untested against WCAG 2.1 AA contrast ratios. |
| Haptic feedback in exercises | StreakCelebration uses haptics; individual vocal exercises do not. A subtle haptic on exercise completion would improve feedback for users with visual impairment. |
| Keyboard / switch access | No external keyboard or switch-control optimisation. Not critical for this user group but worth noting. |
| `accessibilityLabel` coverage | Most interactive elements lack explicit labels. A full pass adding `accessibilityRole` + `accessibilityLabel` to all Touchables and animated elements is needed before any App Store submission. |
