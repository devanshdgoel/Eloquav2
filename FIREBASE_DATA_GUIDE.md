# Eloqua — Firebase Data Guide

How to find, read, and interpret every piece of data stored in Firebase for a user.

---

## Access

**Firebase Console → Eloqua project (eloqua-f714f)**

Two products store data:
- **Authentication** — user accounts (email, UID, creation time)
- **Firestore Database** — all app data, organised by user UID

The backend (FastAPI + Firebase Admin SDK) bypasses Firestore security rules entirely.
The frontend (React Native client SDK) is governed by the rules you published.

---

## Firestore Structure

```
Firestore root
├── user_progress/          (top-level collection)
│   └── {uid}               (one document per user)
│
└── users/                  (top-level collection)
    └── {uid}/              (one document per user, plus sub-collections)
        ├── assessments/
        │   └── baseline    (one document — the initial voice assessment)
        ├── check_ins/
        │   └── {auto-id}   (one document per completed check-in)
        ├── voice_sessions/
        │   └── {auto-id}   (one document per speech enhancement session)
        ├── funnel_events/
        │   └── {auto-id}   (one document per onboarding milestone reached)
        ├── session_logs/
        │   └── {auto-id}   (one document per training session started)
        └── usage_events/
            └── {auto-id}   (one document per feature usage event)
```

---

## Document Reference

### `user_progress/{uid}`

The primary progress document. Written by both client SDK and Admin SDK.

| Field | Type | Description |
|---|---|---|
| `sessions_completed` | number | Total training sessions completed (includes check-ins and baseline) |
| `current_node` | number | Roadmap position (0–19), always `min(19, sessions_completed)` |
| `streak_days` | number | Current consecutive-day streak |
| `last_session_date` | string | `YYYY-MM-DD` of last completed session (UTC) |
| `last_checkin_session` | number | `sessions_completed` value when the last check-in was done |
| `difficulty_tiers` | object | `{phonation, loudness, pitchGlides, speech}` — integers 1–5 |
| `recent_exercise_scores` | array | Last 14 sessions' per-exercise scores `[{date, phonation?, loudness?, ...}]` |
| `baseline_focus_key` | string | Weakest area from baseline: `'phonation'` \| `'pitchGlides'` \| `'speech'` |

**To find:** Firestore → `user_progress` collection → document whose ID = user's UID.

**Key questions this answers:**
- How many sessions has this user done? → `sessions_completed`
- Are they engaged? → `streak_days`, `last_session_date`
- Is the difficulty system working? → watch `difficulty_tiers` change across sessions

---

### `users/{uid}` (top-level document)

User profile. Written by `saveUserProfileToFirestore()` during onboarding.

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name entered during SetupAboutYou |
| `age` | string | Age range selected (`'18–24'`, `'55–64'`, etc.) |
| `voice_id` | string | ElevenLabs voice clone ID (set after baseline assessment) |

---

### `users/{uid}/assessments/baseline`

The initial voice assessment. Written once per user after completing the baseline Assessment screen.

| Field | Type | Description |
|---|---|---|
| `recorded_at` | Timestamp | When the assessment was submitted |
| `assessment_type` | string | Always `'baseline'` |
| `composite.voice_power` | number \| null | Score 0–100 (best of 3 sustained-a rounds) |
| `composite.expression` | number \| null | Score 0–100 (pitch variety from reading + free speech) |
| `composite.fluency` | number \| null | Score 0–100 (speech rhythm from reading + free speech) |
| `tasks` | object | Per-task breakdowns keyed by `sustained_a_1`, `sustained_a_2`, `sustained_a_3`, `reading`, `free_speech` |

**To find:** `users → {uid} → assessments → baseline`

**Key question:** What was this user's starting voice quality?

---

### `users/{uid}/check_ins/{auto-id}`

One document per completed Progress Check-in. Written after every CheckinScreen completion.

| Field | Type | Description |
|---|---|---|
| `recorded_at` | Timestamp | When the check-in was submitted |
| `assessment_type` | string | Always `'checkin'` |
| `composite.voice_power` | number \| null | Post-exercise voice power score |
| `composite.expression` | number \| null | Post-exercise expression score |
| `composite.fluency` | number \| null | Post-exercise fluency score |

Documents are ordered by `recorded_at`. The ProgressScreen reads these in ascending order to draw sparklines.

**To read all check-ins for a user:**
Firestore Console → `users → {uid} → check_ins` → sort by `recorded_at`

**Key question:** Is this user's voice improving over time? Compare `composite` here vs `assessments/baseline`.

---

### `users/{uid}/voice_sessions/{auto-id}`

One document per Speech Enhancement session (written by `/api/analyze-voice` backend route as a background task). Also written after baseline + check-in assessment recordings.

| Field | Type | Description |
|---|---|---|
| `recorded_at` | Timestamp | When the session was saved |
| `task_type` | string | `'free_speech'` (enhancement) \| `'sustained_a'` \| `'reading'` |
| `scores.voice_power` | number \| null | Voice power score 0–100 |
| `scores.expression` | number \| null | Expression score 0–100 |
| `scores.fluency` | number \| null | Fluency score 0–100 |
| `transcript` | string | Transcribed speech text |
| `audio_duration_s` | number | Recording length in seconds |
| `features` | object | Raw acoustic features (jitter, shimmer, HNR, F0, etc.) |

---

### `users/{uid}/session_logs/{auto-id}` *(new — added for Pilot 1.0)*

One document per training session started. Used to compute session completion rate and abandonment points.

**Completed session:**

| Field | Type | Description |
|---|---|---|
| `ts` | Timestamp | When the log was written (Firestore server time) |
| `started_at` | string | ISO timestamp when VocalTrainingSessionScreen mounted |
| `completed_at` | string | ISO timestamp when finishSession() was called |
| `duration_s` | number | Elapsed seconds from start to finish |
| `node_index` | number | Which roadmap node this session was for (0–19) |
| `completed` | boolean | Always `true` for this variant |
| `exercise_scores` | object | `{phonation?, loudness?, pitchGlides?, speech?}` — 0–100 each |
| `tiers_at_start` | object | `{phonation, loudness, pitchGlides, speech}` — tier 1–5 at session start |

**Abandoned session:**

| Field | Type | Description |
|---|---|---|
| `ts` | Timestamp | When the log was written |
| `started_at` | string | ISO timestamp when session started |
| `abandoned_at` | string | ISO timestamp when user confirmed "Leave" |
| `duration_s` | number | Elapsed seconds before abandonment |
| `node_index` | number | Roadmap node |
| `completed` | boolean | Always `false` for this variant |
| `abandoned_at_exercise_index` | number | Which exercise index (0–7) the user was on |
| `abandoned_at_exercise_type` | string | Exercise name: `'breathing'`, `'phonation'`, `'pitchGlides'`, etc. |
| `exercise_scores_partial` | object | Scores earned before abandonment |

**Key query (session completion rate):**
```
users/{uid}/session_logs where completed == true  → count
users/{uid}/session_logs                          → total count
rate = completed / total
```

---

### `users/{uid}/funnel_events/{auto-id}` *(new — added for Pilot 1.0)*

One document per onboarding milestone reached. Used to identify where users drop off.

| Field | Type | Description |
|---|---|---|
| `ts` | Timestamp | When the event was logged |
| `event` | string | See values below |

**Event values (in order of the onboarding funnel):**

| Event | When it fires |
|---|---|
| `signup_completed` | User's Firebase account created successfully |
| `about_you_completed` | SetupAboutYou "Continue" tapped, profile saved |
| `assessment_baseline_started` | "Begin" tapped on the baseline Assessment intro |
| `assessment_baseline_completed` | Baseline saved and app navigates to Home |
| `home_first_visit` | HomeScreen mounted for the first time (AsyncStorage-gated) |

**Key question:** What % of users who sign up actually complete the baseline? Filter `funnel_events` by event name across all users and count.

---

### `users/{uid}/usage_events/{auto-id}` *(new — added for Pilot 1.0)*

One document per Speech Enhancement usage attempt.

| Field | Type | Description |
|---|---|---|
| `ts` | Timestamp | When the event was logged |
| `event` | string | `'speech_enhance_completed'` or `'speech_enhance_failed'` |
| `duration_ms` | number | Recording duration in ms (only on `completed`) |
| `reason` | string | Failure reason: `'no_audio'` \| `'network_error'` \| `'api_error'` \| `'recording_error'` (only on `failed`) |

---

## How to Look Up a Specific User

1. Go to **Firebase Console → Authentication → Users**
2. Find the user by email
3. Copy their **UID** (e.g. `AbCdEf123...`)
4. Go to **Firestore → `user_progress` → paste UID** to see their progress
5. Go to **Firestore → `users` → paste UID** to see their profile + all sub-collections

---

## Pilot Analytics — What to Check Weekly

Open Firestore Console. For each user (by UID):

| Question | Where to look |
|---|---|
| How many sessions completed? | `user_progress/{uid}` → `sessions_completed` |
| Last active date? | `user_progress/{uid}` → `last_session_date` |
| Current streak? | `user_progress/{uid}` → `streak_days` |
| Did tiers advance? | `user_progress/{uid}` → `difficulty_tiers` (compare week 1 vs week 2) |
| Did they complete sessions or abandon? | `users/{uid}/session_logs` → filter `completed == true/false` |
| Where did they abandon? | `users/{uid}/session_logs` where `completed == false` → `abandoned_at_exercise_type` |
| Is their voice improving? | Compare `assessments/baseline.composite` vs latest `check_ins` composite |
| Did they complete onboarding? | `users/{uid}/funnel_events` → check for `assessment_baseline_completed` |
| Did they use Speech Enhancement? | `users/{uid}/usage_events` → count `speech_enhance_completed` docs |

---

## How to Clear All Firebase Data (Fresh Start)

### Step 1: Delete all Firestore data

There is no "delete all" button in the Firebase Console for large collections. Use this approach:

**Option A — Console (for small datasets):**
1. Firestore → `user_progress` collection → click each document → Delete
2. Firestore → `users` collection → click each document → (delete sub-collections first, then the document)

**Option B — Firebase CLI (faster, recommended):**
```bash
# Install Firebase CLI if not already
npm install -g firebase-tools
firebase login

# Delete the collections
firebase firestore:delete --all-collections --project eloqua-f714f
```
This will prompt for confirmation before deleting.

### Step 2: Delete all Authentication users

1. Firebase Console → **Authentication → Users**
2. Select all users (checkbox at top)
3. Click the three-dot menu → **Delete account(s)**

Or via Admin SDK (run once from backend directory):
```python
from firebase_admin import auth, initialize_app
initialize_app()
page = auth.list_users()
while page:
    for user in page.users:
        auth.delete_user(user.uid)
    page = page.get_next_page()
```

### Step 3: Clear AsyncStorage on test devices (optional)

The `eloqua_home_first_visit` and `eloqua_onboarding_complete` flags live in AsyncStorage on the device, not Firebase. If re-testing onboarding on the same device after a data reset, either:
- Uninstall and reinstall the app, or
- Add a "Clear local data" developer button in Settings that calls `AsyncStorage.clear()`

---

## Security Rules (currently deployed)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /user_progress/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{subcollection}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

**What this means:**
- An authenticated user can only read/write their own documents — not anyone else's
- Unauthenticated requests are rejected entirely
- The backend (Admin SDK) ignores these rules and has full access

**What's still open:** There are no Firestore indexes yet for querying across users (e.g. "all users with sessions_completed > 5"). For pilot analytics, read each user's document individually. Post-pilot, add composite indexes if you build an admin dashboard.
