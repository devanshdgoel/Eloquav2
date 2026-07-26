# Eloqua v2 — Three-Perspective Review & Co-Design Brief

**Prepared:** 26 July 2026
**Method:** Complete walkthrough of every screen, user flow, exercise, service, and backend scoring module in the repo (`devanshdgoel/Eloquav2`), simulated from three perspectives. The app is an Expo/React Native native app, so flows were traced end-to-end through the code (navigation, state, timers, audio logic) rather than on a device — every runtime claim below is anchored to a specific file and line so it can be verified in minutes. Where a bug is asserted, the exact code path is cited.

---

# PART 1 — The Patient's Walkthrough

*Persona: 68-year-old with Parkinson's, mild-to-moderate hypophonia, slight hand tremor, slower processing speed, low patience for tech. Minimal context: "my daughter installed a speech app for me."*

## 1.1 First open → signed up

**What went well:** The dolphin splash is charming. The sign-up screen is clean, fields are big, "Show/Hide" password is written in words not icons. The mic permission screen explains *why* it needs the mic before asking — that built trust. "Audio processed securely. Never shared." was reassuring.

**Where I struggled, got confused, or got stuck:**

1. **The splash animation held me hostage.** The dolphin sequence runs ~5.9 seconds with no skip before the Login/Create buttons even begin fading in (`SplashScreen.js` animation chain: 400+1400+500+600+400+1600ms, then a further ~3.3s of reveal animations before buttons are fully visible). Every single time I open the app I sit through this. As a returning user it's splash (~5.9s) → Opening greeting (another ~2.9s, `OpeningScreen.js` 2500ms timer + 400ms fade) → Home. That's roughly **9 seconds of unskippable animation before I can do anything, every day**.
2. **Two mystery buttons on the splash screen.** There's a faint "↺" in the bottom-left (the dev "Fresh start" that **wipes all local data** — `SplashButtons.js:14–34`, rendered at `opacity: 0.18`) and a wave logo bottom-right that silently signs me in as a guest. I tapped the wave logo out of curiosity and suddenly I was on the Home screen with no explanation, no mic permission asked, no name asked. I didn't know I was a "guest" or that my progress could vanish.
3. **Password + confirm password** is four fields of typing with a tremor. There was no "sign in with Apple/Google" option, and no `textContentType`/`autoComplete` hints so my phone's password manager didn't offer to help.
4. **The Terms checkbox is tiny.** 24×24px (`SignUpScreen.js` checkbox style) — everything else in the app is 56px, this one took me three tries.
5. **If I tap "Not now" on the microphone screen I'm stuck.** The only button is "Allow microphone →"; denying shows an alert and leaves me on the same screen with no way forward (`SetupPermissionsScreen.js:56–76`). A cautious older user who habitually denies permissions is dead-ended on day one.
6. **The notification permission popped up immediately after the mic one.** Two system dialogs back to back was disorienting — I reflexively denied the second.

## 1.2 Home screen (the roadmap)

**What went well:** The "GET STARTED — Set Up Your Voice Profile" banner told me exactly what to do first. Big nodes, clear dolphin marker, streak flame is friendly.

**Issues:**

7. **I couldn't scroll the map the way I expected.** I swiped up and down on the path — nothing. The map only moves via the small orange chevron buttons at top/bottom edges (`HomeScreen.js` — `Animated` canvas driven exclusively by `scrollUp`/`scrollDown` taps, no PanResponder/ScrollView). Every phone user's instinct is to drag. With 20 nodes at 130px spacing that's a lot of arrow tapping, two nodes per tap.
8. **Tapping a future node does nothing at all.** No message, no wiggle, no "complete session 3 first" toast (`onPress` is `undefined` for future nodes). I genuinely wondered if the app had frozen.
9. **Tapping an already-completed node quietly re-runs a full session — and advances my progress.** Done nodes are tappable (`handleNodePress` fires for `isDone`), the session is identical, and on completion `completeSession()` increments `sessions_completed` and moves `current_node` forward regardless of which node I tapped (`progressService.js:83–124`). I replayed "session 2" for fun and the app skipped me ahead to session 12. (Detail in Part 4, bug C4.)
10. **"Smart Speech" card meant nothing to me.** "Real-time AI voice enhancement" is feature-speak. What does it *do for me*? "Hear your own voice, made clearer" would land. Also the explainer screens that exist in the codebase (WhatIsEloqua / HowItWorks / VoiceCloningExplainer) are never shown to anyone — there is no place in the app that explains what Eloqua is.
11. **The numbers on future nodes confused me.** Nodes show "2, 3, 4…" but the level label says "Level 1" and check-in nodes show a ★ with no legend. I didn't know what the star meant until I hit it.

## 1.3 Daily Voice Note → Baseline session

**What went well:** "How are you feeling today?" with a big pulsing mic is lovely. The read-aloud speaker button on the question is exactly what I need on tired days. Done button unlocking only after 3 seconds prevented accidental taps.

**Issues:**

12. **I didn't know why I was being recorded.** The screen asks a personal question and records 20s of me talking — nowhere does it say what happens to that recording or why it helps. One sentence ("This helps us track how your voice changes day to day") would fix it.
13. **I tapped "Skip for now", then came back later the same day — it asked me again.** The skip path never writes the daily key (`DailyVoiceNoteScreen.js` — `handleSkip` → `goToSession()` without `AsyncStorage.setItem(DAILY_VOICE_KEY…)`, which only happens in `stopRecording`). The header comment says skip should count for the day; the code disagrees.
14. **"Skip for now" at the bottom is almost invisible** — white at 28% opacity, 15px (`skipBottomText`).
15. **Baseline exercises started abruptly.** After breathing, "Sustained Sound" appeared with a title screen, then instructions, then it *auto-calibrated and armed the mic*. The phase "Listening to room…" then suddenly "Say 'Aah' — as loud and long as you can!" with no countdown. Twice I was mid-breath when it armed.
16. **The whack-a-jellyfish game bewildered me on first contact.** During my *baseline* (my very first session, at tier 2), a jellyfish rose from a hole, a countdown drained, and when I was too slow it sank back down. I didn't understand that failure was fine and the same word would return. The sinking jellyfish felt like losing a game I didn't know I was playing — during an *assessment* of my disease.
17. **Time pressure everywhere despite the promise of none.** `ACCESSIBILITY.md` says "no time pressure", but Loudness gives me 3–6 seconds per phrase, and Functional Speech gives 5 seconds of mic time before declaring "Doesn't sound correct." Speech initiation delay is a *core PD symptom* — I often need 2–3 seconds just to start.
18. **The voice-clone recording didn't ask my permission properly.** "Create Your Voice Profile" asked me to read two sentences. Nothing said my voice would be uploaded to a third-party AI service (ElevenLabs) to build a synthetic copy of my voice. I'd want to be asked plainly. (The purpose-built `VoiceCloningExplainerScreen` exists — it's just never shown.)
19. **My results screen was mostly reassuring — but "Developing" for my weakest score** with "Projection is the primary target" felt clinical after all the warm language. Small thing.

## 1.4 A regular training session

**What went well:** One exercise at a time, big title cards between exercises that wait for my tap, "Can't do this right now" escape hatch on every exercise with genuinely kind copy ("No worries. Your voice needs rest too."), midpoint rest screen, help "?" that pauses and re-shows instructions with read-aloud. This structure is excellent for me.

**Issues:**

20. **The "Next up" card doesn't tell me what to do.** The card shows only the exercise name and a picture — the `desc` sentence that the code prepares for each exercise ("Take a deep breath, then hold a steady 'Ahhh'…") is never rendered (`ExerciseTitleCard.js` displays `exercise.label` only; `SESSION_EXERCISES[].desc` is unused). The session screen's own comment says the desc is shown "so users always know what they are about to do without relying on memory" — that's exactly what I needed and didn't get.
21. **In Sustained Sound, the bars sometimes never turned green.** With my TV on in the background, the adaptive threshold climbed (up to 0.82 normalised — roughly −21 dBFS, `SustainedPhonationExercise.js:32,399`) and nothing I did registered. There's no indication of *how loud is loud enough* — no target line on the bars, no "quieter room needed" hint. I just saw a zero that wouldn't move and assumed my voice was the problem. **That is the worst possible feeling this app can produce.**
22. **Pitch Glides told me to change pitch but responded to loudness** (iOS). The prompts say "Say 'ahh' — LOUD / softly" with hoops labelled LOUD/quiet, but it's called *Pitch* Glides and the tutorial talks about pitch range. Confusing mixed message. (On Android it's worse — see bug C2.)
23. **When I opened the help "?" mid-round, closing it restarted the round from zero.** My 8 seconds of "Aah" was gone (`closeHelp()` → `startNextRound()`). Asking for help cost me progress.
24. **Functional Speech cut the sentence off before finishing reading it to me.** The mic auto-opens 2.8s after the item loads (`AUTO_SPEAK_MS = 2800`) and `openMic()` calls `Speech.stop()` — but a tier-2+ sentence at 0.8 rate takes 5–15s to read aloud. I heard "Good morning, how are—" *silence* "Say it now, loud!". I couldn't repeat what I never heard. (Bug C3.)
25. **"Doesn't sound correct. Give it another try!"** appeared when I simply took too long to start. I *hadn't said anything yet*. Being told my speech "doesn't sound correct" — by an app for people ashamed of their speech — because of a timeout stung.
26. **After my session, the app crashed to a plain fallback screen.** The streak celebration played, I tapped continue, and instead of the commitment screen I got the error boundary. (This is real: `StreakCommitmentScreen.js` uses an SVG `<Line>` component that is never imported — bug C1. Every non-baseline session ends at this screen.)
27. **No pause, no resume.** If my phone rang mid-session (15 minutes is long), the session state lives only in memory. Coming back after a forced quit = start from exercise 1, streak intact but effort lost.

## 1.5 Check-in day

28. **The check-in is enormous.** Record my sentence → four full exercises (breathing 3 cycles, phonation 3 rounds, pitch glides, functional speech) → record again → results. Easily 20+ minutes on a "check-in", with no upfront warning of the length. I'd have chosen a different time of day had I known.
29. **Backing out after the exercises loses everything silently.** The "Leave check-in?" guard only exists during the mini-exercise phase (`CheckinScreen.js:159–180`, `if (phase !== 'mini') return`). During the *post* recording and *comparison* screens — after 20 minutes of work — a back-swipe exits with no warning and no session credit.
30. **"Behind" label on the plan card.** If it ever shows (see bug C5 — for new users it currently never can), being told I'm "Behind" on a degenerative disease timeline is the wrong word. "Building" or nothing.
31. **The before/after arcs can show me getting worse after training.** Post-exercise fatigue is textbook PD. The copy handles it gently ("Consistency is what counts") — good — but a red "−7" next to my voice power immediately after doing my exercises reads as "training made me worse."

## 1.6 Progress, Settings, Smart Speech

32. **Progress screen shows no voice data.** Sessions count, streak, level, 4 badges — but none of the voice scores the app measures every day. I record a daily voice note and get nothing back for it. Where is my "voice power over time" line going up? That's the graph that would keep me practising.
33. **The Progress screen check-in countdown disagrees with Home.** At exactly session 7 the Home banner says a check-in is due, while Progress says "7 sessions until your next progress check-in" (`ProgressScreen.js:211` — `nextCheckin` calculation skips the current milestone).
34. **Settings is admirably simple** (genuine positive — reminder, larger text, feedback, sign-out is all I need). But: no way to hear/redo my voice clone, no privacy policy or terms (they're only reachable from the Sign-Up screen), no "About Eloqua".
35. **Smart Speech's "Copy text" button doesn't copy** — it opens the system share sheet (`shareText()` uses `Share.share`). I wanted it in my clipboard.
36. **The enhanced voice plays slowed down** (hard-coded `rate: 0.85`). It didn't sound like "me, clearer" — it sounded like me, sedated. No speed control.
37. **Guest users can reach everything but were never asked for the mic** — first exercise fails into skip paths.

## 1.7 Overall feeling as a patient

The bones of this app are unusually kind: escape hatches, read-aloud everywhere, big targets, warm words. But the app's *promise* of calm is repeatedly broken by its *mechanics*: timers, thresholds I can't see, restarts when I ask for help, a crash after every session, and instructions that get cut off. The distance between "designed for me" and "works for me" is exactly the co-design gap to close.
---

# PART 2 — The Speech & Language Therapist's Review

*Persona: SLT with a PD caseload, LSVT LOUD certified, moderately tech-savvy. Question: would I recommend this to my patients between sessions?*

## 2.1 First impressions (as a lay user)

The app is warm, legible, and unusually respectful of fatigue — short blocks, rest points, skip options that don't guilt-trip. The dolphin/ocean world is age-appropriate without being childish (the whack-a-jellyfish game is the one exception that skirts childishness). Onboarding is fast. As a *product*, this is far above the usual "word list with a record button" apps in this category.

## 2.2 What is clinically strong (keep and protect these)

1. **The exercise selection is the right one.** Sustained phonation (MPT proxy), loudness drills with calibrated feedback (LSVT-inspired), pitch glides (F0 range), functional carryover speech, diaphragmatic breathing as warm-up/reset. This is a faithful home-practice translation of the evidence base for hypokinetic dysarthria. The code comments (`LoudnessDrillsExercise.js` header, `BaselineResultsScreen.js` header) show real engagement with Ramig et al. — not decorative citation.
2. **The three-axis model (voice power / pitch variety / speech rhythm) is legitimate** and maps to intensity, F0-SD, and rate/pause metrics that the backend actually computes with Praat/parselmouth (`voice_analysis_service.py`) — including honest caveats in the code that jitter/shimmer from phone mics are trend-only and cross-user comparison is invalid. Whoever wrote that understands mobile acoustics. Score anchors (45–75 dB intensity band, 0–50 Hz F0-SD, 130 WPM optimum) are defensible approximations.
3. **The daily voice note is the single best clinical idea in the app.** A daily ~20s unstimulated monologue on a rotating personal question is exactly the ecologically valid longitudinal sample researchers struggle to collect. If retained and surfaced, this is publishable-grade data collection.
4. **The personal sentence pre/post check-in** ("a sentence you say every day") is a clever functional outcome measure with high face validity for patients.
5. **Adaptive difficulty done sensibly:** baseline at tier 2 to discriminate, per-dimension tier adjustment (not a blunt average), automatic nudges from 3-session rolling averages with hysteresis (≥85 up, ≤40 down), tailored slot targeting the weakest area with baseline-focus tie-breaking (`difficultyService.js`). This is more sophisticated than most commercial offerings.
6. **Ambient calibration before volume-gated exercises** is the right instinct for uncontrolled home environments.
7. **The "Can't do this right now" pattern** — normalising a bad day without breaking the habit loop — is something I wish every therapy app had.

## 2.3 Clinical concerns — significant

8. **Loudness thresholds are relative, uncalibrated, and invisible to the user.** All volume gates are normalised dBFS from the phone mic at unknown distance. Fine as a *relative* trend, but the exercises present them as absolute pass/fail ("LOUDER!", jellyfish sinks). A patient whose phone sits closer today "improves." More importantly: **there is no calibration against the patient's own baseline loudness** in the drills — thresholds come from tier tables + ambient noise, not from the individual's voice. LSVT's core mechanic is recalibrating effort relative to *the patient's* habitual loudness. Recommendation: capture the patient's comfortable loudness at baseline and set drill thresholds as "+X dB above *your* usual voice at fixed phone position," and show the target on the meter.
9. **Time-pressure mechanics are contraindicated for this population.** Speech initiation latency and bradykinesia mean 3-second responses windows (Loudness tier 1) and a 5s mic timeout (Functional Speech) will punish precisely the patients with the most severe presentation — and the failure animations (sinking jellyfish, "Doesn't sound correct") deliver the punishment emotionally. The design docs themselves promise "no time pressure." Either remove countdowns for these exercises, scale them generously by tier, or make timer expiry a *neutral* retry ("Let's try that one again — take your time").
10. **"Doesn't sound correct" is harmful copy.** Shown both for STT mismatch and for *timeouts*. Dysarthric speech is *exactly* what STT mis-transcribes — the app risks telling patients their (intelligible) speech is wrong because Whisper stumbled. Reframe to effort/volume framing, never correctness of their speech, and never fire it on a timeout.
11. **Pre/post within one session is a practice-effect measure, not progress.** LSVT uses within-session pre/post for *effort demonstration*, which is fine — but the app frames it as "See how far your voice has come" and drives *difficulty tier changes* off a single pre/post delta (`adjustDifficultyAfterCheckin`, ±5 points on scores with unknown test-retest reliability for 3–20s samples). Fatigued patients will be down-tiered for showing the disease's hallmark fatigue. Suggest: adjust tiers from the 14-session rolling exercise scores (already stored!) and use pre/post purely motivationally.
12. **The "Pitch Glides" exercise does not train pitch on iOS.** The dolphin is driven by loudness (metering), with pitch only measured after the fact by the backend. So on iOS, "Pitch Glides" is a *second loudness exercise* with pitch-flavoured labels; a patient could score 100 by getting louder in a monotone... and the session then contains three loudness tasks and no true real-time pitch task. On Android there is real-time autocorrelation pitch tracking, so the two platforms train different skills under one name. This needs to be an explicit design decision, honestly labelled ("Voice Effort" on iOS?) or solved technically.
13. **Streak mechanics need a chronic-disease adaptation.** Duolingo-style hard reset to 1 after one missed day is demotivating for people with off-days, medication fluctuations, and hospital appointments. Evidence on habit formation in chronic disease favours flexible streaks (freeze tokens, "5 of last 7 days" framing). Also `"You're in the top 5% of users"` (StreakCommitment copy at 14 days) is a fabricated statistic — remove; and "Your voice is becoming unstoppable" over-promises a disease-modifying effect that voice training does not have. Keep effort claims ("you're building a habit"), drop outcome claims.
14. **No safety/vocal-hygiene screening or guardrails.** High-effort loud phonation is contraindicated with vocal fold pathology (nodules, reflux laryngitis — common comorbidities). LSVT requires laryngeal exam before treatment. At minimum: an onboarding disclaimer ("check with your care team, stop if you feel pain/hoarseness beyond normal effort"), a "this should feel effortful but never painful" line before loudness work, and pain/strain check-ins. Currently the app never mentions strain, pain, or hydration.
15. **No clinician loop.** Data of genuinely clinical quality (daily notes, Praat features, exercise scores) is collected and… never shown to anyone — not the patient (Progress screen shows only counts), not a clinician (no export, no report, no share-with-my-SLT). For a co-design session with therapists this is the biggest missed opportunity: a simple monthly PDF/email summary would make this app a *tool I'd actually integrate into care*.

## 2.4 Clinical concerns — moderate

16. **Dose and duration are on the light side of evidence.** ~15 min/day is reasonable for maintenance, but the 20-node/20-session programme with no stated frequency target ("daily" is implied by streaks only) and no post-programme plan (what happens after node 20?) leaves the therapeutic arc undefined. LSVT is 4×/week × 4 weeks *intensive*; the app should state its intended cadence and what "finishing" means.
17. **Breathing pacing is fixed at 4-2-4.** Acceptable default; some patients need 3-1-3 or longer exhale (exhale ≥ inhale is preferred for phonation support — a 4-2-6 option would be more aligned with practice).
18. **Sustained phonation scores wall-clock, not voiced time**, and stops after 280ms of dip — reasonable, but a voice crack (common in PD) ends the round; consider a slightly longer 500ms grace specifically at higher tiers.
19. **Functional speech "success" is volume-gated then STT-checked with 50% word match.** Lenient is the right direction, but it means the exercise measures loudness + rough intelligibility, not articulation. Fine — but then the *fluency* tier shouldn't be driven by it alone.
20. **Baseline validity:** the reading and pitch-glide mini-tasks send audio for offline scoring with a 12s timeout and silently fall back to `score 50 → tier 2` (`BaselineSessionScreen.js` `augmentedScores`). On a cold Render backend (15–20s spin-up is acknowledged in code comments) a *first-ever user* — the exact person doing the baseline — will very often hit the timeout and get default tiers, undermining the whole personalised-start feature. Pre-warm before the baseline (as Smart Speech already does) or extend the timeout with a friendly wait state.
21. **Check-in mini-exercises discard their scores** (`handleMiniComplete()` ignores the score argument) — a free data point lost.
22. **Age question includes "Under 18"** — harmless, but for a PD product it signals template reuse; consider diagnosis-relevant onboarding questions instead (years since diagnosis, medication timing — the *best* predictor of session performance variability is time-since-levodopa, and a simple "best time of day to practise" nudge would be clinically smart).

## 2.5 Would I recommend it to patients?

**After the crash fix and the timer/copy softening: yes, for mild-to-moderate hypophonia as an adjunct between therapy blocks** — the exercise core is sound and the tone is right. I would not yet recommend it for patients with significant cognitive impairment (timers, game metaphors) or with untreated voice pathology (no screening). To become a clinical companion rather than a wellness app it needs: visible progress data, a clinician export, individual loudness calibration, and safety language.
---

# PART 3 — The UI/UX Designer's Audit

*Persona: senior product designer, accessibility specialist, first time seeing the app. Screen-by-screen pass, then systemic findings.*

## 3.1 Systemic — Major

1. **The design system exists but is bypassed everywhere.** `theme/index.js` is an excellent v3 token system with an explicit "never hard-code hex/sizes" rule — and then nearly every screen defines its own local `ORANGE/WHITE/MINT` constants and hard-coded font sizes (`HomeScreen.js` COLORS block, `SplashButtons.js` `#2D6974`, every exercise file). Consequences are already visible: two oranges circulating (`#FFA940` and legacy `rgba(254,156,45,…)` — see `streakPill` border vs flame icon), duplicated help-overlay stylesheets pasted into five exercise files, and any future palette change requiring ~30 file edits. This is the top maintainability issue.
2. **The "Larger text" setting is applied inconsistently.** `fs()` scaling is wired into perhaps 40% of text nodes; whole screens (HomeScreen node labels, StreakCelebration, ExerciseTitleCard, ProgressScreen chips at 12px, most exercise internals) ignore it. Also the app ignores the OS-level font scale entirely (no `allowFontScaling` strategy). For this audience, text scaling is not a nice-to-have.
3. **Screen-reader accessibility of the core loop is broken.** The roadmap nodes are SVG `<G>` elements with `onPress` and **no accessibility props** (`HomeScreen.js` node render) — VoiceOver/TalkBack users cannot start a training session after their first (once the setup banner disappears, node-tap is the only entry point). Buttons elsewhere are well-labelled, which makes this gap stand out.
4. **Contrast failures on functional text.** White at 0.28–0.45 opacity on teal is used for actionable elements: "Skip for now" (0.28), daily-note hint (0.40), zone labels "LOUD/quiet" at 13px/0.35, `CantDoNow` trigger 15px at 0.60. WCAG AA (4.5:1) fails for most of these. Decorative dimming is fine; *controls and instructions* must not fall below AA — this is a low-vision-heavy audience.
5. **Motion is unskippable and pervasive** — splash (~6s), Opening (~3s), streak celebration (~2.3s before the continue button even appears), staggered day-circle springs. There is no reduced-motion support (`AccessibilityInfo.isReduceMotionEnabled` never referenced) and no "tap to skip" affordance on any of them. Elderly users + vestibular sensitivity + daily repetition = animation debt.
6. **Sub-16px text persists despite the documented 16px floor:** SignUp field labels 13px, privacy note 13px, T&C body 15px, BaselineResults card titles 13px/descs 13px/footnotes 12px, ProgressScreen chip labels 12px, plan tags 13px, `categoryLabel` 12px on the daily note. The Session-6 audit (per ACCESSIBILITY.md) caught exercise screens but missed onboarding/results/progress surfaces.

## 3.2 Systemic — Minor

7. **Inconsistent back/exit iconography and behaviour:** `✕` sometimes exits the whole session (exercise screens), sometimes goes back one sub-step (`InstructScreen` onBack → title), `←` elsewhere; ExerciseTitleCard's ✕ is a bare 44px glyph with `alignItems:'flex-start'` (small, left-clipped target) while everywhere else uses the 56px ghost circle.
8. **Button hierarchy wobbles:** primary CTA is usually the orange pill, but the exercise title cards use a *ghost* square arrow as the only affordance (low discoverability for the most important tap in the session), and the splash "Create new account" (primary for new users) is teal while Login is white — the visual weight ordering flips.
9. **The word "session" is overloaded:** roadmap sessions, check-in "sessions", guest "session", sign-out "session". Fine for devs, noisy for users.
10. **Node numbering off-by-one:** nodes display `i+1` while docs and code speak of node 0/session 1; the ★ check-in nodes have no label or legend at all.
11. **Duplicate "halfway" moments:** MidpointScreen is itself an announcement card, and the session already suppresses the title card before it — good — but the midpoint pips hard-code "4 done of 8" regardless of skip behaviour (`s.pips` — `i < 4`), so after skipping an exercise the pips lie.
12. **Mixed Figma-scaling strategies:** some screens scale by `SC = W/402` on spacing only, PitchGlides scales *positions* by width *and* height independently (`fs/fv`) which will distort hoop geometry on tall/short devices (hoop ellipses stretch), others don't scale at all. Pick one responsive strategy.
13. **`KeyboardAvoidingView behavior="height"` on Android** (SignUp) is usually janky; `padding` + `android:windowSoftInputMode` is the standard fix. TextInput in Check-in setup screen has no `KeyboardAvoiding` sibling spacing issue check on small phones.
14. **Dead/orphaned screens create design entropy:** `SettingsScreen_full.js` (1,049 lines), `AssessmentScreen.js` (still imported & registered but unreachable), `DolphinVowelsExercise.js` (991 lines, unused), WhatIsEloqua/HowItWorks/VoiceCloningExplainer/SetupVoice (registered, never navigated), AboutYouIntro/Personalise (unregistered). Nine files of alternative UI = drift risk each time a shared component changes.

## 3.3 Screen-specific — Major

15. **Splash:** dev reset button visible in production build (`__DEV__` guard missing — compare with the skip-zones in session screens which *do* use `__DEV__`); guest entry is an unlabelled logo tap that also *pre-marks onboarding complete before auth succeeds* (`handleGuestSignIn` calls `setOnboardingComplete()` first — if anonymous auth then throws a non-auth error, state is inconsistent).
16. **Home:** arrow-only scrolling (no gesture); no empty/failed state for the map itself; setup banner and Smart Speech card + error banner can stack and push the viewport small on SE-size screens; streak pill overlaps the top scroll arrow zone (both top-right/top-centre absolute at zIndex 20/30) on narrow devices.
17. **Session flow:** progress bar at the very bottom is 8px and easy to miss — consider step count ("3 of 8") in the header, which also aids orientation after help overlays; there's no persistent indication of *which* exercise number you're on except round pills within an exercise.
18. **Check-in comparison screen:** six numeric arcs + deltas + tier pills + plan card is the densest screen in the app, shown at the moment of *maximum fatigue*. Needs progressive disclosure (headline first, "see details" expander).
19. **Smart Speech results:** "Copy text" mislabelled (opens share sheet); play button has four states (loading/failed/play/stop) communicated only through label swaps — good bones, but "Audio unavailable" gives no retry; the live transcript card labelled "LIVE ENHANCED" at 10px-ish caption with a red-dot metaphor may read as "recording is being broadcast".
20. **StreakCommitment:** share button is a no-op (`handleShare` has a comment "can be wired later") — a visible dead control; weekly calendar marks *calendar days* from streak count, which double-counts users who did 2 sessions in one day (streak stays 1, but yesterday's circle still fills)… minor data lie.

## 3.4 Screen-specific — Minor

21. **SignUp:** no inline validation (all errors are modal Alerts — jarring); no `textContentType="newPassword"`/`autoComplete` for password managers; "Voice training app" tagline duplicated with splash.
22. **SetupAboutYou:** age modal list has no initial scroll to a plausible band (older users scroll past Under 18 first); "Continue" is enabled solely by name — pressing it with empty age is fine, but nothing says age helps personalisation.
23. **DailyVoiceNote:** greeting uses local time but the once-per-day gate uses UTC (`todayDateString()` = `toISOString`) while streaks use local dates (`progressService.today()` = `en-CA` locale string) — after 11pm UK time these disagree (note recorded "tomorrow", streak "today").
24. **Breathing:** cycle pills use two near-identical teals for active vs done (`#2D9BA2` vs `#1A6068`) — hard to distinguish; phase label crossfade means during the fade there's no instruction visible.
25. **Sustained Sound:** the timer shows "–" during calibration with tiny "Listening to room…" — a first-time user reads a dead dash; the "Best: Xs" label only appears from round 2.
26. **Loudness:** word card font drops to 18px for 8-word phrases (`fontSize` ladder bottoms at 18 with `minimumFontScale={0.5}` → can render ~9px) — below floor for the *primary content*; counter reads "1/5" before any success which reads as score 1 out of 5.
27. **PitchGlides (both):** the vertical volume bar has no scale, threshold marker, or label; zone labels are 13px; the dolphin at rest sits at the *lower-left hoop position* which implies "you are in the low zone" before any sound.
28. **BaselineResults:** three cards show band labels ("Strong/Building/Developing") but not the underlying scores — while the check-in *does* show raw numbers; inconsistent numeracy policy. Footnote cites research at 12px italic.
29. **Progress:** "Level N" pill duplicates roadmap levels but is computed as `floor(sessions/7)+1` with no cap (session 20 → "Level 3", but map has only Levels 1–3 markers — verify); achievements are only 4 and three are effectively count aliases.
30. **Settings:** version row reads from `expoConfig.version` — dash when run in some update channels; feedback goes to a personal ic.ac.uk email; delete-account has no in-progress/success state (fires request then instantly signs out).
31. **OfflineBanner overlays every screen including active exercises** — verify it doesn't cover the exercise close button (it renders above NavigationContainer).
32. **Error copy tone drifts:** "Something went wrong", "Could not save session", "Sign in failed" — mostly fine, but Alerts use OS styling that clashes with the otherwise custom, warm sheet patterns (CantDoNow shows the better pattern — reuse it for confirmations like "Leave session?").

## 3.5 What is genuinely good design (protect it)

- The **teal/orange/mint system** with the three canonical gradients is distinctive, calm, and consistent-feeling even where implementation drifts.
- **ScreenHeader / SpeakerButton / CantDoNow / TabBar** are exactly the right shared components; SpeakerButton-on-everything is a standout accessibility feature rarely seen.
- **56px touch targets** as a norm, "Done unlocks after 3s" on recordings, hitSlop on small links — real motor-accessibility thinking.
- The **exercise title card cadence** (never auto-advance into an exercise) is the correct pacing model for this population.
- **Waveform/metering feedback** during recording is immediate and legible; green-when-loud on phonation bars is a great glanceable signal (when thresholds cooperate).
- **The tab-bar illusion** (instant transitions + persistent TabBar) is a clever, well-executed pattern.
- Warm, specific microcopy in the celebration/commitment/rest moments; jargon audit clearly happened.
---

# PART 4 — Compiled Developer Brief (Co-Design Master List)

Everything from Parts 1–3, deduplicated, translated into developer language, verified against the code, and ranked. **C = Critical (fix before any further testing), M = Major (fix this sprint), m = Minor (batch), P = Polish/ideas.** File:line references are to the current `main`.

## 4.0 Confirmed bugs — Critical

| ID | Bug | Where | Detail & fix |
|----|-----|-------|--------------|
| **C1** | **Crash after every regular session** — `Line` is used but never imported | `StreakCommitmentScreen.js:62` (`ShareIcon`), imports at `:27` only `{ Path, Polyline }` | Every non-baseline session ends `StreakCelebration → StreakCommitment`, which throws `ReferenceError: Line is not defined` on render and lands in the root ErrorBoundary. Add `Line` to the `react-native-svg` import. One-line fix, highest user impact in the app. |
| **C2** | **Android Pitch Glides highlights the wrong hoop** — inverted target parity | `PitchGlidesExercise.js:859` (`const targetHigh = hoopsDone % 2 === 0;`) vs detection at `:811` (`% 2 === 1`) | On Android the UI/prompt says "Higher pitch → upper hoop" while the detector requires the LOW zone (and vice versa) — the exercise is effectively unwinnable by following instructions. Change `:859` to `% 2 === 1` (match iOS render at `:607`). |
| **C3** | **Functional Speech cuts TTS off after 2.8s** then demands the user repeat a sentence they never heard | `FunctionalSpeechExercise.js:54` (`AUTO_SPEAK_MS = 2800`), `openMic()` calls `Speech.stop()` at `:432` | Tier ≥2 sentences at rate 0.80 need 5–15s. Use `Speech.speak`'s `onDone` callback to open the mic (with a max-cap fallback), keep "I'm ready →" as the manual override. |
| **C4** | **Replaying a completed node advances real progress** | `HomeScreen.js:154–176` (done nodes call `handleNodePress`) → `VocalTrainingSessionScreen.finishSession()` → `progressService.completeSession():83` increments unconditionally | Tapping done node 2 while on node 10 jumps the user to node 11, breaks check-in cadence (`sessions_completed % 7`), and lets one day mint several nodes. Decide the model: (a) replays are practice-only (pass `isReplay` and skip `completeSession`), or (b) done nodes not tappable. (a) is kinder. |
| **C5** | **"VS YOUR PLAN" check-in feature is dead for all new users** — `progress_plan` is never written | `storeProgressPlan` called only from orphaned `AssessmentScreen.js:516`; active `BaselineSessionScreen.finishBaseline()` never calls `computeProgressPlan`/`storeProgressPlan` | Since the V4 switch to BaselineSession, no user gets a plan, so `CheckinScreen`'s plan card (`:679`) silently never renders. Call `computeProgressPlan(scores, mpt)` + `storeProgressPlan` in `finishBaseline()`, using the phonation best-seconds as the MPT input. |
| **C6** | **Dev "Fresh start" (wipes AsyncStorage + creates new anonymous UID) ships to users** | `SplashButtons.js:82–87`, rendered at `opacity 0.18`, no `__DEV__` guard | Any curious tap → "Clears all data… Go" → local data gone and a *new* Firebase user (orphaning cloud progress). Wrap in `__DEV__` like the session skip-zones already are. |
| **C7** | **Denying mic permission dead-ends onboarding** | `SetupPermissionsScreen.handleAllow():56–76` — no "continue anyway" path | Add a "Continue without microphone for now" path (exercises already degrade to skip on mic failure), or loop with a clear re-ask. Also stagger the notification request (`:64`) to a later, contextual moment (e.g. after first session: "Want a daily reminder?"). |

## 4.1 Major — functionality & logic

| ID | Issue | Where | Recommendation |
|----|-------|-------|----------------|
| M1 | Check-in exit guard covers only the `mini` phase — backing out during `post`/`comparison` loses 20+ min silently | `CheckinScreen.js:159–180` | Extend `beforeRemove` guard to `post` and `comparison`; on `comparison`, offer "Finish now" in the alert (data is already in memory). |
| M2 | Help overlay restarts the current round/item, discarding in-round progress | `SustainedPhonationExercise.closeHelp():562` → `startNextRound()`; same pattern in Breathing (`closeHelp` → `runCycle(cycleIndex)` restarts cycle), Loudness, FunctionalSpeech | Acceptable for breathing; for phonation, keep `bestRef` (already kept) but tell the user: "We'll restart this round." Or pause/resume mic instead of restart. At minimum add copy so it isn't a surprise. |
| M3 | Adaptive threshold can exceed a reachable level in noisy rooms with zero user feedback | `SustainedPhonationExercise.js:32` (cap 0.82), `calibrateAmbient` formula `p90*2.5+0.14`; similar in Loudness (`*1.6+0.12`, cap 0.70) | Show a target line on the meter; if calibration lands above ~0.65, show "It's a bit noisy here — find a quieter spot?" before starting; log calibrated thresholds to analytics to tune the formulas with pilot data. |
| M4 | Exercise title card never shows the instruction `desc` | `ExerciseTitleCard.js` renders `label` only; `VocalTrainingSessionScreen.js:43–84` defines `desc` and comments claim it's shown | Render `exercise.desc` under the title (with SpeakerButton). Cheap, high value for memory-impaired users. |
| M5 | Timer-based failure loops in Loudness / Functional Speech (PD speech-initiation latency) | `LOUDNESS_TIER_CONFIG.timerMs` 3000–6000; `FunctionalSpeechExercise.js:56` `MAX_RECORD_MS = 5000` → `handleWrong()` | Double timers at tiers 1–2, make expiry a neutral retry (no "Doesn't sound correct", no sink-shame animation on the first miss), and consider removing the visible countdown drain at tier 1. |
| M6 | "Doesn't sound correct. Give it another try!" fires on timeouts and STT misses alike | `FunctionalSpeechExercise` drawer `:720` | Split states: timeout → "Take your time — tap the speaker to hear it again."; STT mismatch → "Let's try that once more — nice and loud." Never imply their speech is *incorrect*. |
| M7 | Baseline scoring silently defaults to tier 2 on backend timeout (cold start) | `PitchGlideMini/ReadingMini` 12s aborts; Render cold start 15–20s per code comments; `BaselineSessionScreen` `?? 50` fallbacks | Fire `/api/wake` when the user taps node 0 (DailyVoiceNote gate is a perfect pre-warm moment); raise timeout to ~25s with a "Analysing… this can take a moment" state; flag defaulted tiers in Firestore so they can be re-derived later. |
| M8 | Tier adjustment driven by single pre/post check-in delta (fatigue penalises severe patients) | `difficultyService.adjustDifficultyAfterCheckin` ±5-point rule | Prefer the existing `recent_exercise_scores` rolling average (already powers `nudgeTiersFromRecentScores`) as the sole tier driver; keep pre/post for motivational display only. Also: check-in mini-exercise scores are discarded (`CheckinScreen.handleMiniComplete` ignores the score arg) — persist them. |
| M9 | Daily voice note: skip doesn't mark the day; date key is UTC while streaks are local | `DailyVoiceNoteScreen.handleSkip():153`; `todayDateString()` (UTC) vs `progressService.today()` (local) | Write the key on skip (matches the header comment's intent); use the same local-date helper in both places. |
| M10 | Guest entry marks onboarding complete before auth and skips mic permission | `SplashButtons.handleGuestSignIn():36–54` | Route guests through SetupPermissions (and optionally name), set onboarding flag *after* successful `signInAnonymously`, and make guest entry a visible labelled option ("Try without an account"). |
| M11 | Offline optimistic result always increments streak (+1 even if already trained today) | `progressService.tryCompleteSession():209` | Compute optimistic streak with the same last-session-date logic as `completeSession`. |
| M12 | iOS/Android Pitch Glides train different skills; `PITCH_TIERS.pitchRangeHz` is dead config | `PitchGlidesExercise.js:72–78` (only `holdMs`/`totalHoops` read) | Product decision needed (see therapist §2.3.12). If keeping the iOS loudness proxy, rename on-screen labels honestly and delete/repurpose `pitchRangeHz`; the docs (`VOCAL_TRAINING.md` "±30Hz tiers") no longer match the code. |
| M13 | Voice cloning without explicit informed consent; ElevenLabs never mentioned | `VoiceSetupExercise` intro; unused `VoiceCloningExplainerScreen` | Insert the existing explainer (it was built for this!) before recording, with explicit "Create my voice profile / Not now" consent and a data-processing sentence. Also surface clone status + delete-clone in Settings (backend `DELETE /voice/clone` exists). |
| M14 | Delete account is fire-and-forget; failure leaves data while user believes it's deleted | `SettingsScreen.handleDeleteAccount():487–495` | Await the DELETE, show progress + success/failure; on failure keep the account signed in with a retry path (GDPR-relevant). |
| M15 | Roadmap nodes invisible to screen readers; no gesture scroll | `HomeScreen.js` SVG `<G onPress>` without accessibility props; arrow-only scrolling | Overlay transparent `TouchableOpacity`s (RN views) on node positions with `accessibilityLabel`s ("Session 5, completed", "Session 12, locked"), or wrap the canvas in a real ScrollView and keep arrows as a bonus. Fixes both findings at once. |
| M16 | Progress screen shows none of the collected voice data; check-in countdown wrong at the milestone | `ProgressScreen.js` (sparklines removed); `:211` `nextCheckin` math (at `sessions=7` says 7 more; Home says due) | Fix countdown: `sessions % 7 === 0 && sessions > last_checkin_session` → "available now". Reinstate a simple 3-line trend (voice power / pitch variety / rhythm from `check_ins` + baseline) — the single most requested artefact from patient & therapist personas. |
| M17 | Streak model: hard reset + fabricated/overclaiming copy | `progressService.completeSession` streak logic; `StreakCommitmentScreen.getMotivation` ("top 5% of users") | Add 1 streak-freeze per week or "X of last 7 days" framing; delete the top-5% line; soften outcome claims. |
| M18 | No session resume; 15-min state in memory only | `VocalTrainingSessionScreen` state | Persist `{nodeIndex, exerciseIndex, scores}` to AsyncStorage on each exercise completion; offer "Pick up where you left off?" on next entry (same day). |
| M19 | Safety content absent (effort vs pain, vocal hygiene, "consult your clinician") | app-wide | One onboarding card + one line in loudness instructions + a strain check in the check-in. Therapist-flagged as a recommendation blocker. |

## 4.2 Minor — batchable

- **m1** "Copy text" opens a share sheet — use `expo-clipboard` (+ toast "Copied"), keep Share as a second button. `SpeechEnhancementScreen.shareText():743`.
- **m2** Enhanced audio hard-coded to `rate: 0.85` — expose Normal/Slower toggle. `:642`.
- **m3** Dead share button on StreakCommitment (`handleShare` no-op) — wire `Share.share` or remove.
- **m4** Splash/Opening: add tap-to-skip; for returning users collapse to ≤2s total; respect reduce-motion globally.
- **m5** Sub-16px text sweep: `SignUpScreen` fieldLabel(13)/privacyNote(13)/tcs(15), `BaselineResultsScreen` 12–13px set, `ProgressScreen` chip labels 12px, `DailyVoiceNote` categoryLabel 12px, Loudness word-card `minimumFontScale 0.5`, zone labels 13px, plan tags 13px.
- **m6** Contrast sweep for actionable text ≥4.5:1: skip links (0.28–0.45 white), CantDoNow trigger, hints.
- **m7** T&C checkbox → 44px+ tap target with the row itself toggling; add inline (non-Alert) validation on SignUp; add `textContentType`/`autoComplete` to auth fields.
- **m8** Future-node tap feedback ("Complete session N first" toast/wiggle); legend for ★ check-in nodes.
- **m9** Midpoint pips hard-code 4-done-of-8 — derive from actual `exerciseIndex`. `MidpointScreen.js:78–82`.
- **m10** Breathing cycle pills: increase active/done colour separation; keep instruction visible during crossfade.
- **m11** Loudness score formula simplification: `Math.round((TOTAL_ROUNDS/(TOTAL_ROUNDS+misses))*100)` — the `Math.max` wrapper is a no-op (`LoudnessDrillsExercise.advanceRound():831`); also counter "1/5" reads as a score — use "Word 1 of 5".
- **m12** `nudgeTiersFromRecentScores` catch-path returns `DEFAULT_TIERS` (a transient Firestore error silently runs the whole session at tier 1) — return `null` and keep prior state instead. `difficultyService.js:306–310`.
- **m13** PitchGlides geometry: don't scale x and y independently (`fs`/`fv`) — hoops distort on non-402×874 aspect ratios.
- **m14** Baseline uses full LoudnessDrills with its STT WebView while the file's own comments say WebView was avoided in the baseline for reliability — either accept (volume-fallback exists) or swap for a mini version; verify iOS mic contention between WebView `getUserMedia` and `expo-av` recording on-device.
- **m15** ExerciseTitleCard ✕ button: use the standard 56px ghost circle.
- **m16** Node-0 double entry: Home setup banner and node 0 both route to baseline — fine, but after the baseline the banner logic `isFirstSession && !checkinDue` can flash stale until `fetchProgress` resolves; show skeleton instead.
- **m17** `HomeScreen` check-in banner condition (`sessions_completed % 7 === 0`) and node-tap condition (`i % 7 === 0 && i === activeNode`) can disagree after C4 replays — unify into one `isCheckinDue()` helper.
- **m18** Feedback mailto points at a personal university address — move to a product alias.
- **m19** Version row fallback "—"; show `Constants.expoConfig?.version ?? nativeApplicationVersion`.
- **m20** Firestore rules in-repo look correct and scoped — but `HANDOFF.md` says production is still in test mode. **Verify what's actually deployed** (`firebase deploy --only firestore:rules`).
- **m21** Alerts for confirmations clash with the app's sheet language — reuse the CantDoNow bottom-sheet pattern for "Leave session?" etc.
- **m22** Whisper STT `ALTS` map includes 'hell' for 'help', 'god' for 'good' — harmless but review.
- **m23** Orphaned files to move to an `/archive` folder (per repo guide, don't delete): `SettingsScreen_full`, `AssessmentScreen` (+ its navigator registration), `DolphinVowelsExercise`, `SetupVoiceScreen`, onboarding explainers (until M13 revives them), `AboutYouIntro`, `Personalise`, `SpeechDemo` if unused.
- **m24** Hard-coded palette/size constants → import from `theme` (do gradually, file-per-touch rule).

## 4.3 What's done well (say it in the session — protect these)

1. **Clinical architecture**: right exercises, honest acoustic pipeline with mobile caveats, three-axis model, adaptive tiers with hysteresis, daily longitudinal voice sample, personal-sentence outcome measure.
2. **Compassion layer**: CantDoNow everywhere, skip-without-shame paths, warm rest/celebration copy, no-jargon audit, encouragement idle prompts.
3. **Accessibility groundwork**: 56px targets, SpeakerButton read-aloud on nearly every instruction, large-text scaffold, accessibility labels on almost all controls, haptics behind a preference.
4. **Engineering hygiene**: offline session queue with reconnect flush, error boundaries with fallback screens, backend pre-warming, audio-mode discipline learned the hard way (comments show it), scoped Firestore rules file, funnel/screen-time analytics, and unusually good code comments + docs (VOCAL_TRAINING.md, ACCESSIBILITY.md, HANDOFF.md).
5. **Product taste**: the roadmap metaphor, tab-bar illusion, title-card pacing, three canonical gradients, streak celebration choreography.

## 4.4 Suggested co-design agenda (fastest path to "as good as possible")

**Week 0 — before showing anyone the app (½ day of fixes):** C1, C2, C3, C6 (four small diffs), then C7, C4, C5. The app cannot be fairly user-tested while every session ends in a crash screen.

**Sprint 1 — trust & feedback loop:** M3 (visible loudness target), M4 (desc on title cards), M5+M6 (timer/copy softening), M16 (progress trends), M9. These are the items patients feel every single day.

**Sprint 2 — integrity & safety:** M13 (clone consent), M19 (safety copy), M8 (tier logic), M14, M1, M10, M17.

**Sprint 3 — accessibility & polish:** M15, M2, m4–m7 sweeps, remaining minors.

**Open product decisions for the co-design table (no code until decided):**
1. What *is* Pitch Glides on iOS? (M12)
2. Replay semantics for completed nodes (C4).
3. What happens after node 20 — maintenance mode, new roadmap, free play?
4. Streak philosophy for chronic illness (M17).
5. Clinician/carer data sharing — the biggest strategic opportunity found in this review (therapist §2.3.15).
6. Should check-ins be shorter (2 mini-exercises instead of 4 full ones)?

---

*End of review. Every finding above is traceable to a file/line in the repo; nothing was tested on a physical device, so audio-threshold and WebView-mic behaviours (M3, m14) should be validated on hardware during the pilot.*
