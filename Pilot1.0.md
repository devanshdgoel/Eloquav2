# Pilot 1.0 — Eloqua MVP Specification

**Dates:** Build window ends ~July 12 | Pilot runs ~3 weeks | August target: App Store + Android  
**Users:** 15–20   
**Constraint:**  
**Goal:** Prove the core loop works — users engage, return, and measurably improve.

---

## 1. What This Pilot Tests

Three core bets, in priority order:

1. **Engagement:** Do users return daily and complete full sessions without hand-holding?
2. **Progress:** Do voice scores (Voice Power, Expression, Fluency) trend upward over 3 weeks?
3. **Feature-market fit:** Is the training-first model (roadmap sessions + speech enhancement) the right product shape, or do users actually just want the speech enhancer?

If (1) and (2) hold, the product is real. If only (3) holds, the roadmap needs rethinking before August.

---

## 2. Frozen Pilot Scope — What's IN

### 2.1 Onboarding (must be zero-confusion)

| Screen | Requirement |
|---|---|
| Splash / BrandReveal | Must animate and resolve in ≤ 3 seconds. No crash on cold start. |
| SignUp | Email + password only. Inline validation errors. Error shown on Firebase auth failure (not silent). |
| SignIn | Same. Auto-routes to Home if `isOnboardingComplete = true`. |
| SetupPermissions | Mic permission request must fire here and handle denial gracefully (explains why it's needed, does not hard-block). |
| SetupAboutYou | Name + age captured, `name.trim()` applied before save. Navigates forward even if save fails (retries silently). |
| Baseline Assessment | Full 5-task flow (3× sustained_a, reading, free_speech). Voice cloning fires after. Must reach Home screen after tapping "Start My Journey." |

**Completion rate target:** ≥ 85% of accounts created reach the Home screen for the first time.

**Auth reliability:** `onAuthStateChanged` 15s timeout in place. SplashScreen must not hang indefinitely for any user.

---

### 2.2 Home Screen — Roadmap

- 20-node sine-wave roadmap renders correctly on all pilot device sizes (minimum 375px width).
- Active node is always visible on focus (auto-scroll to 1/3 down visible area).
- Node states correct: done (teal + checkmark), active (white + orange ring), upcoming (semi-transparent).
- `current_node` clamped — no crash if Firestore returns out-of-range value.
- Progress banner and check-in nudge visible when due (every 7 sessions).
- Settings and Progress screen accessible from Home header.

---

### 2.3 Vocal Training Sessions — the Core Loop

Each session runs 8 exercises in a fixed sequence:

```
Breathing → Phonation → PitchGlides → Loudness → Midpoint → Breathing → Tailored → FunctionalSpeech
```

**Completion requirement:** A user who starts a session and taps through all 8 exercises must reliably land on StreakCelebration and have their progress saved to Firestore. This must work on:
- First session (initialises Firestore document)
- Any subsequent session
- After a streak break

**Session save reliability target:** ≥ 95% of completed sessions successfully write to Firestore. The 5% covers genuine network failures, not app crashes.

**Session duration target:** A motivated user should be able to complete a full session in 12–18 minutes. If it runs longer than 20 minutes, exercises are too slow.

**Back-navigation guard:** "Leave session?" alert must fire on any user-initiated back press. Programmatic navigation (session complete → StreakCelebration) must not be blocked.

**Progress bar:** Orange fill at bottom must animate to correct fraction at each exercise advance.

---

### 2.4 Exercises — Tier System

All 4 scored exercise types must be fully functional with all 5 tiers:

| Exercise | Pilot-critical behaviours |
|---|---|
| SustainedPhonation | Silence detection fires correctly (stops recording after ~1.8s silence post-phonation). Goal reached feedback shown at tier threshold. |
| LoudnessDrills | Timer fires at tier-correct duration. WordCard resizes text for longer content without overflow. |
| PitchGlides | WebView mic access works. `micError` overlay shown + skip available if mic denied. Hoop count matches tier. |
| FunctionalSpeech | Items built correctly per tier. API call only fires if recording succeeded. Handles 401 before advancing (does not send to next exercise on auth failure). |

**Tier adjustment:** `nudgeTiersFromRecentScores()` fires on session load. Users should see tiers advance if they score consistently above threshold across 2–3 sessions. Target: a motivated user at tier 1 should reach tier 2–3 within 2 weeks.

**TailoredExercise:** Always picks the exercise with the lowest tier. If tiers are equal, focuses on the `focusKey` set from baseline assessment.

---

### 2.5 Adaptive Difficulty — Quantified

Tier advancement must be observable within the pilot window:

- A user scoring ≥ 70 on an exercise for 3 consecutive sessions should advance that exercise's tier.
- A user scoring ≤ 40 for 2 consecutive sessions should drop a tier.
- `difficulty_tiers` in Firestore must update correctly; a re-opened session must reflect the updated tier, not default to 1.

---

### 2.6 Progress Check-In (every 7 sessions)

- Check-in banner appears on Home screen when `sessions_completed % 7 === 0` and `sessions_completed > last_checkin_session`.
- AssessmentScreen with `type='checkin'` runs the same 5-task flow.
- Composite scores saved to Firestore via `/api/save-assessment` as `type=checkin`.
- After check-in, ProgressScreen sparklines update to reflect new data point.
- `recordCheckin()` called so banner doesn't re-appear until next 7-session interval.

**For a 3-week pilot:** Users completing 5 sessions/week will hit check-ins at session 7 (end of week 1) and session 14 (end of week 2). This gives us 2 comparison data points against baseline — enough to show trajectory.

---

### 2.7 Speech Enhancement

- Full IDLE → RECORDING → PROCESSING → RESULTS flow.
- Audio recording (HIGH_QUALITY m4a) → POST `/api/process-audio` → playback of enhanced audio.
- **Reliability target:** ≥ 90% of submissions return an `audio_url` without error. Network errors show the ERROR state (not a crash). Processing time ≤ 15 seconds on a standard WiFi connection.
- Raw transcript, cleaned transcript, and voice profile displayed correctly in RESULTS.
- Screen accessible from Home (node tap or direct navigation).
- completeSession() is NOT called here — speech enhancement does not advance the roadmap.

---

### 2.8 Progress Screen

- ProgressRing shows `sessions_completed / 20` correctly.
- Voice score sparklines render from baseline + check-in data.
- Milestones unlock correctly (First Voice, Week Warrior, Committed, Voice Growing, etc.).
- Level badge shows `Math.floor(sessions / 7) + 1`.
- "N sessions until your next check-in" hint visible and accurate.
- Retry button works on load failure.

---

### 2.9 Streak & Notifications

- StreakCelebration screen fires after every completed session.
- StreakCommitment screen fires on first session (day 1 commitment).
- Re-engagement notification fires if no session logged in 24 hours (`notificationService.js`).
- Streak increments on consecutive days; resets correctly after a gap; does not double-count same-day sessions.

---

### 2.10 Settings Screen

- Displays user name, email.
- Sign out works and routes to Splash.
- No crash on any Settings interaction.

---

### 2.11 Backend Reliability

| Endpoint | Requirement |
|---|---|
| POST `/api/analyze-voice` | ≤ 30s timeout enforced (already in code). Returns scores or null (never crashes the assessment). |
| POST `/api/save-assessment` | Returns 200 on success. Non-200 surfaces an Alert with retry. |
| POST `/api/complete-session` | Same as above. |
| POST `/api/process-audio` | ≤ 15s on WiFi. Returns `audio_url`. |
| POST `/api/voice/clone` | Non-fatal — failure is logged but never blocks the user flow. |
| GET `/api/audio/{filename}` | Path traversal blocked (resolved path prefix check in place). |

**Server uptime:** Backend must be reachable for all 3 weeks of the pilot. Ensure it is not running on a local machine or free-tier service that sleeps.

---

### 2.12 UI Consistency

- All text ≥ 16px (WCAG 2.1 floor).
- Single orange `#FFA940` used everywhere — no legacy `#FE9C2D` instances.
- Font sizes never scaled by `SC` (screen scale factor) — only decorative sizing and spacing use it.
- No broken layouts on iPhone SE (375px) or iPhone Pro Max (430px).
- Dark gradient backgrounds consistent across all screens (no white flash between screens).

---

## 3. What's Explicitly NOT in Pilot 1.0

These are frozen — do not build them, do not reference them in the UI:

| Feature | Why deferred |
|---|---|
| Google Sign-In | Needs iOS OAuth client. Out of scope. |
| Apple Sign-In | Needs Apple Developer account. Out of scope. |
| Android | August target. TestFlight is iOS-only. |
| VoiceOver / TalkBack full audit | Not enough time. Basic `accessibilityRole` on primary CTAs only. |
| Dynamic OS text scaling | Fixed font sizes intentional for pilot. |
| In-app feedback / support chat | Use email for pilot; track issues manually. |
| Social features, sharing | Post-pilot. |
| Onboarding explainer screens | WhatIsEloqua, HowItWorks, VoiceCloningExplainer exist but are not in the active flow. |
| Firestore security rules | Remain in test mode for pilot. Must restrict before public App Store release. |
| 401 auto-refresh | Known gap. Surfaced as an error to the user. Acceptable for 15–20 known pilot users. |
| iOS PrivacyInfo.xcprivacy | Required for App Store submission — not TestFlight. |

---

## 4. Expected Risks and Failure Modes

### High probability

| Risk | Impact | Mitigation |
|---|---|---|
| Backend cold start / downtime mid-pilot | All API-dependent features break. | Ensure backend on always-on hosting (Railway, Render, EC2). Add a `/health` ping. |
| Voice cloning on re-entry clones twice | Duplicate ElevenLabs voice IDs, wrong playback. | Add Firestore check for existing `voice_id` before calling `/api/voice/clone` (deferred, but flag before pilot). |
| PitchGlides WebView mic permission iOS | Most disruptive exercise breaks silently. | The `micError` overlay + skip is in place. Test on real device before TestFlight build. |
| Users complete multiple sessions per day | Streak does not double-count (correct), but roadmap advances — some users may complete 20 nodes in < 3 weeks. | Cap at 2 sessions/day, or accept it and treat as power-user data. |
| Assessment API timeout on slow connection | Voice scores return null. Users see "–" in results. | Non-fatal by design. Pilot users should be briefed to use WiFi. |
| ElevenLabs / OpenAI rate limits under multi-user load | process-audio fails. | 15–20 users is low load. Monitor but unlikely to be an issue. |

### Medium probability

| Risk | Impact | Mitigation |
|---|---|---|
| Users drop at SetupAboutYou | Low completion rate. | Keep it short (name + age only). Already done. |
| Tier advancement too slow | Users feel stuck at tier 1; sessions feel repetitive. | Verify `nudgeTiersFromRecentScores()` fires correctly. If tiers don't move by session 4, the threshold is too high. |
| Session exercise variety too low | Users report boredom by week 2. | The exercise sequence is fixed but content varies by tier. Acceptable for a 3-week pilot. Flag as a known limitation in user briefing. |
| Firebase Auth token expiry (1-hour default) | 401 errors if user leaves app open. | Known gap. Brief pilot users to close and reopen the app if they see errors. |

### Low probability but high impact

| Risk | Impact | Mitigation |
|---|---|---|
| Firestore bill spike | Cost unpredictable at scale. | 15–20 users = negligible Firestore reads. Spark plan is fine for pilot. |
| Audio file size over `MAX_AUDIO_SIZE_MB` | process-audio rejected. | Backend enforces the limit. Pilot users briefed to keep recordings under 2 minutes. |

---

## 5. What We Want to Learn

### Primary questions

1. **Do users complete sessions?** Session completion rate (started → StreakCelebration). Target: ≥ 65%.
2. **Do users return?** Day-7 and day-14 retention. Target: ≥ 40% of pilot users still active at week 2.
3. **Do scores improve?** Baseline → check-in 1 → check-in 2 delta for Voice Power, Expression, Fluency. Target: ≥ 50% of users show improvement in at least one metric.
4. **Where do users drop off in onboarding?** Identify the last screen reached by users who never complete a session.
5. **Which exercise is rated hardest?** Session exercise scores — lowest average score across all users = the exercise to improve first.

### Secondary questions

6. Is speech enhancement used alongside training, or instead of it?
7. Do users check their Progress screen voluntarily (without being prompted)?
8. Which milestones are unlocked by end of pilot? (Validates difficulty calibration.)
9. Does the streak mechanism create return motivation, or does it feel punishing?

---

## 6. Analytics — Data We Track

### Already stored in Firestore (no new work needed)

| Field | Location | What it tells us |
|---|---|---|
| `sessions_completed` | `user_progress/{uid}` | Total engagement depth |
| `streak_days` | `user_progress/{uid}` | Retention quality |
| `last_session_date` | `user_progress/{uid}` | Recency |
| `current_node` | `user_progress/{uid}` | Roadmap progress |
| `last_checkin_session` | `user_progress/{uid}` | Check-in compliance |
| `difficulty_tiers` | `user_progress/{uid}` | Skill progression |
| Baseline assessment composite | `assessments/{uid}_baseline_*` | Starting voice quality |
| Check-in composite scores | `assessments/{uid}_checkin_*` | Voice improvement trajectory |
| Per-task results JSON | `assessments` | Which task contributes most to score |

### Needs to be added before pilot (required for pilot to be analytically useful)

**1. Session event log** — store a document per session in `session_logs/{uid}/sessions/{timestamp}`:
```json
{
  "started_at": "<ISO timestamp>",
  "completed_at": "<ISO timestamp>",
  "duration_s": 840,
  "node_index": 3,
  "exercise_scores": { "phonation": 72, "loudness": 58, "pitchGlides": 44, "speech": 61 },
  "tiers_at_start": { "phonation": 2, "loudness": 1, "pitchGlides": 1, "speech": 1 },
  "completed": true
}
```
This is the single most important addition. Without it, we cannot compute session completion rate or exercise-level performance trends.

**2. Onboarding funnel events** — log screen_reached events to Firestore at each onboarding step:
```json
{ "event": "reached_SetupAboutYou", "timestamp": "...", "uid": "..." }
```
Add to: SignUp, SetupPermissions, SetupAboutYou, Assessment (baseline started), Assessment (baseline completed), Home (first visit).

**3. Speech enhancement usage log** — in `usage_logs/{uid}`:
```json
{ "event": "speech_enhance_completed", "duration_ms": 8200, "timestamp": "...", "success": true }
```

**4. Session abandonment** — when the user confirms "Leave" from the mid-session alert, log:
```json
{ "event": "session_abandoned", "exercise_index": 3, "timestamp": "..." }
```

### What to read weekly during the pilot

| Metric | How to check | Threshold that concerns me |
|---|---|---|
| DAU / registered users | Count `user_progress` docs with `last_session_date` = today | < 20% = retention problem |
| Session completion rate | `session_logs` completed:true / total | < 60% = session too long or exercise broken |
| Average sessions per user / week | Sum `sessions_completed` / users / weeks elapsed | < 3 = low engagement |
| Onboarding drop-off | Funnel events: % reaching Assessment vs SignUp | < 70% reaching Assessment = onboarding friction |
| Check-in compliance | Users with `last_checkin_session >= 7` / users with `sessions_completed >= 7` | < 50% = check-in not compelling |
| Tier advancement | Count users with any tier ≥ 2 by week 2 | < 50% = difficulty too hard or nudge not firing |
| Score trajectory | mean(checkin_1_composite) - mean(baseline_composite) per dimension | Any dimension declining on average = exercise targeting wrong |

### Most important single metric

**Session completion rate** is the highest-signal metric for the pilot. If users start sessions but don't finish, everything else is noise — the exercises are too hard, too long, too tedious, or broken. Fix that first.

**Day-7 retention** is the second most important. If users complete sessions in week 1 but don't return in week 2, the streak/progress mechanic isn't creating pull.

---

## 7. Pilot Success Criteria

The pilot "passes" if, by end of week 3:

| Criterion | Target |
|---|---|
| Users who completed ≥ 5 sessions | ≥ 10 of 15–20 |
| Users who completed at least 1 check-in | ≥ 8 of 15–20 |
| Session completion rate | ≥ 65% |
| At least one voice metric improved vs baseline | ≥ 50% of users |
| Zero crash-to-black bugs reported | 100% |
| Speech enhancement success rate | ≥ 90% |

If these hold, proceed to App Store + Android in August. If day-7 retention is below 30%, pause and investigate before continuing.

---

## 8. Pre-Pilot Checklist (Build Window Tasks)

In rough priority order:

- [ ] Session event logging to Firestore (required — see §6)
- [ ] Onboarding funnel events (required — see §6)
- [ ] Speech enhancement usage logging (required — see §6)
- [ ] Session abandonment logging (required — see §6)
- [ ] Backend deployed to always-on hosting (not local machine)
- [ ] Verify PitchGlides WebView mic works on real iPhone (not just simulator)
- [ ] Verify baseline assessment → voice cloning → SetupVoice duplicate clone guard
- [ ] Remove dev skip zone (long-press bottom-right corner) from release build
- [ ] TestFlight build distributed to 15–20 users with brief onboarding guide (2-page PDF: what to do, how to report issues, that they should use WiFi for best results)
- [ ] Firestore monitoring enabled (usage alerts, so you know if something is hammering the DB)
- [ ] Manual walkthrough of full new-user flow on a clean account 48h before TestFlight release
