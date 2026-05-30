# Eloqua — Speech Enhancement Feature

*Last updated: 2026-05-30 (V3)*

---

## 1. Feature Overview

**Screen:** `frontend/src/screens/SpeechEnhancementScreen.js`

The Speech Enhancement screen (internally called "Smart Speech") lets a user record their voice in real time, transcribes speech in overlapping 4-second chunks via Whisper or SONIVA, applies GPT-4o clarity editing to each chunk, then synthesises a full enhanced audio playback using the user's ElevenLabs-cloned voice. The result is a cleaned transcript and an audio file the user can listen to or share.

### State Machine

```
IDLE → RECORDING → ENHANCING → RESULTS
                ↘ ERROR
```

| State | Description |
|---|---|
| `IDLE` | Microphone prompt. Tap to start. |
| `RECORDING` | expo-av recording active. Amoeba blob animation playing. Chunk timer firing every 4 s. |
| `ENHANCING` | Recording stopped. Final POST to `/api/enhance-text` in flight. Spinner shown. |
| `RESULTS` | Cleaned transcript displayed. Audio player and Share button visible. |
| `ERROR` | Network failure or backend error. Retry button shown. |

### Scale Factor

All layout dimensions are computed from:

```js
const SC = Dimensions.get('window').width / 402;
```

`402` is the Figma frame width. Multiply every `px` value from Figma by `SC` to get device-independent units.

### Amoeba Blob Animation

During `RECORDING`, a procedurally animated organic blob is rendered using `react-native-svg`. Control points orbit a centre at varying radii driven by `Animated` values, producing a breathing amoeba-like shape. The animation is started on entry to `RECORDING` state and stopped on exit.

### Share Button

On the `RESULTS` screen a share icon (top-right of the transcript card) calls `Share.share()` from `react-native`, passing the `cleaned_transcript` as the share payload.

---

## 2. Backend Pipeline

All endpoints live under the FastAPI app hosted at `eloqua-backend.onrender.com`.

### 2.1 `POST /api/transcribe-chunk`

**Purpose:** Per-chunk transcription and clarity pass during live recording.

**File:** `backend/api/speech_routes.py`

**Request (multipart/form-data):**

| Field | Type | Description |
|---|---|---|
| `audio` | file | 4-second `.m4a` chunk from expo-av |
| `chunk_index` | int | Zero-based index of this chunk |
| `previous_text` | string | Raw transcript accumulated so far (for context) |
| `previous_enhanced_text` | string | Clarity-enhanced transcript accumulated so far |
| `model` | string | `"whisper"` or `"soniva"` |

**Response (JSON):**

```json
{
  "raw_text": "uh the the quick brown fox",
  "enhanced_text": "The quick brown fox"
}
```

**Processing steps:**

1. **Silence detection:** If the audio file is smaller than 5000 bytes, the chunk is treated as silence and immediately returns `{"raw_text": "", "enhanced_text": ""}` without calling any external API.
2. **Transcription:** Audio sent to Whisper (OpenAI `whisper-1`) or SONIVA depending on `model` param. Returns raw text.
3. **Hallucination filter:** Raw text is passed through a filter before the clarity step (see §4).
4. **Clarity pass:** Filtered raw text + context from `previous_text` and `previous_enhanced_text` sent to GPT-4o with a Parkinson's-tuned prompt. Returns `enhanced_text` for this chunk.

---

### 2.2 `POST /api/enhance-text`

**Purpose:** Final coherence pass and TTS synthesis after recording stops.

**File:** `backend/api/speech_routes.py`

**Request (multipart/form-data):**

| Field | Type | Description |
|---|---|---|
| `raw_text` | string | Full raw transcript (all chunks concatenated) |
| `enhanced_text` | string | Full clarity-enhanced transcript (all chunks concatenated) |
| `user_id` | string | Derived from Firebase auth token on the backend (not sent by client) |

**Authentication:** Requires `Authorization: Bearer <firebase_id_token>` header. `user_id` is extracted from the verified token by the `get_current_user` dependency.

**Response (JSON):**

```json
{
  "cleaned_transcript": "The quick brown fox jumps over the lazy dog.",
  "clarity_applied": true,
  "audio_url": "/api/audio/enhanced_abc123.mp3",
  "voice_profile": "cloned"
}
```

**Processing steps:**

1. **Final coherence cleanup:** GPT-4o prompt takes the full `enhanced_text` and performs cross-chunk sentence boundary repair, removes duplication artefacts from chunk joins, and normalises punctuation.
2. **Voice lookup:** Calls `has_cloned_voice(user_id)`. Returns the stored ElevenLabs `voice_id` for this user, or `None` if voice cloning has not been completed.
3. **TTS synthesis:** `cleaned_transcript` passed to ElevenLabs text-to-speech API using the user's `voice_id` (or `DEFAULT_PROFILE` fallback). Audio saved to disk; filename returned as `audio_url`.

---

### 2.3 `POST /api/process-audio` (Legacy / Single-shot)

**Purpose:** Legacy single-shot endpoint. Still used by `FunctionalSpeechExercise` for scoring after an exercise phrase recording.

**File:** `backend/api/speech_routes.py`

**Request (multipart/form-data):**

| Field | Type | Description |
|---|---|---|
| `audio` | file | Full recording `.m4a` |
| `model` | string | `"whisper"` or `"soniva"` (optional, defaults to whisper) |

**Authentication:** Requires `Authorization: Bearer <firebase_id_token>` header (V3 — all routes auth-gated).

**Response (JSON):**

```json
{
  "raw_transcript": "uh the cat sat on the mat",
  "cleaned_transcript": "The cat sat on the mat.",
  "clarity_applied": true,
  "audio_url": "/api/audio/enhanced_xyz789.mp3",
  "voice_profile": "default"
}
```

**Processing steps:** Whisper transcription → hallucination filter → GPT-4o clarity → ElevenLabs TTS in a single sequential call. No chunking.

---

### 2.4 `GET /api/audio/{filename}`

**Purpose:** Serve synthesised audio files to the frontend.

**File:** `backend/api/audio_routes.py`

**Path traversal protection:** The resolved absolute path of `filename` is checked against the `AUDIO_DIR` prefix. Any request that resolves outside `AUDIO_DIR` returns 403.

**Media type detection:** File extension → `Content-Type` via `AUDIO_MEDIA_TYPES` dict:

```python
AUDIO_MEDIA_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
}
```

Unknown extensions return `application/octet-stream`.

---

## 3. Chunked Pipeline Flow

```
User taps Record
  ↓
expo-av recording starts (HIGH_QUALITY, m4a, 80 ms metering interval)
  ↓
setInterval fires every CHUNK_INTERVAL_MS = 4000 ms
  │
  ├─ [Silence detection] If >80% of metering readings in the last 4 s are below -40 dBFS → skip chunk, no API call
  │
  ├─ Save current audio segment to a temp file
  ├─ POST to /api/transcribe-chunk (chunk_index, previous_text, previous_enhanced_text, model)
  ├─ Receive { raw_text, enhanced_text }
  └─ Append to rawAccumulator and enhancedAccumulator
  ↓ (repeat every 4 s while recording)

User taps Stop
  ↓
Interval cleared; recording stopped
  ↓
POST to /api/enhance-text (rawAccumulator, enhancedAccumulator)
  ↓
Receive { cleaned_transcript, clarity_applied, audio_url, voice_profile }
  ↓
expo-av Sound.createAsync(audio_url) → playback ready
State → RESULTS
```

### Client-side Silence Detection

Before dispatching a chunk to the backend, the frontend evaluates the metering history for the last 4-second window:

```js
const silentFrames = meteringHistory.filter(db => db < SILENCE_THRESHOLD_DB).length;
if (silentFrames / meteringHistory.length > SILENCE_RATIO) {
  // Skip chunk — do not POST
  return;
}
// SILENCE_THRESHOLD_DB = -40 dBFS
// SILENCE_RATIO = 0.80
```

This prevents sending blank audio files to Whisper, which would otherwise hallucinate filler phrases (a known Whisper behaviour on silent input).

---

## 4. Hallucination Filter

**Location:** `backend/api/speech_routes.py` (applied in `transcribe_chunk` before the clarity step)

Whisper is trained on internet video data and tends to emit specific phrases when audio is ambiguous or very quiet. The filter catches these before they contaminate the transcript.

### Filter Rules

| Rule | Description |
|---|---|
| YouTube phrases | Exact match against a blocklist: `"thank you for watching"`, `"please subscribe"`, `"like and subscribe"`, `"see you in the next video"`, `"don't forget to subscribe"`, etc. If the entire raw transcript matches a phrase in the list, it is discarded and returns `""`. |
| Multiple dollar amounts | Regex match for two or more dollar-sign amounts (e.g. `$3.99 ... $12.00`). Whisper price-lists on indistinct speech. Full text discarded. |
| Single non-plausible word | If the entire transcript is one word and that word is not in `VALID_SINGLE_WORDS` (a set of common English single-word utterances: `"yes"`, `"no"`, `"hello"`, `"okay"`, `"stop"`, `"help"`, `"please"`, `"thanks"`, etc.), the transcript is discarded. Prevents confident-sounding random word insertions. |
| Repetition of previous context | If the raw transcript is a substring or close match of `previous_text`, it is treated as a repeated echo artefact and discarded. |

---

## 5. Transcription Model Selection

Users can switch transcription models from the Settings screen.

| Model | Identifier | Notes |
|---|---|---|
| Whisper | `"whisper"` | OpenAI `whisper-1`. General-purpose, strong accuracy on clear speech. |
| SONIVA | `"soniva"` | Stroke/dysarthria-tuned alternative. Selected when the user has stroke aphasia. |

**Storage:** The user's model preference is persisted in AsyncStorage under the key `eloqua_preferences`:

```json
{ "transcriptionModel": "whisper" }
```

**Passing to backend:** `SpeechEnhancementScreen` reads the preference at recording start and passes it as the `model` field in every `/api/transcribe-chunk` request. The `model` field is also passed in `/api/process-audio` calls from `FunctionalSpeechExercise`.

---

## 6. Voice Cloning Integration

### How Cloning Happens

Voice cloning is initiated during the baseline assessment (`AssessmentScreen`). After completing all three tasks, the reading and free-speech recordings are POSTed to `/api/voice/clone` (ElevenLabs Instant Voice Clone). The returned `voice_id` is stored in Firestore at `users/{uid}.voice_id`.

A user can re-record their baseline from the Settings screen, which re-triggers the clone flow and overwrites the stored `voice_id`.

### TTS Voice Selection in enhance-text

```python
voice_id = await has_cloned_voice(user_id)
if voice_id:
    # Use user's personal cloned voice
    tts_voice = voice_id
    voice_profile = "cloned"
else:
    # Fall back to shared default
    tts_voice = DEFAULT_PROFILE
    voice_profile = "default"
```

`has_cloned_voice(user_id)` reads Firestore `users/{uid}.voice_id`. Returns the `voice_id` string if present and non-empty, otherwise `None`.

### ElevenLabs Quota Note

The free/starter tier supports approximately 10 concurrent voice clone slots and a monthly character cap. When the cap is reached, TTS synthesis fails silently and `voice_profile = "default"` is returned. Monitor usage in the ElevenLabs dashboard before any public launch.

---

## 7. Authentication (V3)

As of V3, all speech and audio endpoints require a valid Firebase ID token.

### Frontend

`SpeechEnhancementScreen` (and all other screens making backend requests) retrieves the current user's token via:

```js
// frontend/src/utils/authHeaders.js
export async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}
```

Every `fetch` call to the backend includes these headers:

```js
const headers = await getAuthHeaders();
const response = await fetch(`${API_BASE_URL}/api/transcribe-chunk`, {
  method: 'POST',
  headers,
  body: formData,
});
```

### Backend

Routes use the `get_current_user` FastAPI dependency (`backend/utils/auth_dep.py`), which calls `firebase_admin.auth.verify_id_token(token)`. On success, `current_user['uid']` is available for Firestore lookups. Requests without a valid token receive `HTTP 401 Unauthorized`.

`user_id` is no longer accepted as a form field — it is always derived from the verified token on the backend.

---

## 8. Known Limitations and Future Work

### Streaming TTS

ElevenLabs TTS currently returns a complete audio file before playback can begin. Synthesis latency is typically 2–4 seconds after the enhance-text call returns. ElevenLabs supports a streaming API (chunked audio delivery); integrating it would allow playback to begin while synthesis is still running, reducing perceived latency significantly.

### Render Cold Start

The backend runs on Render's free tier, which spins down after 15 minutes of inactivity. The first request of the day may take 30–60 seconds. A health-check ping is fired from `AuthContext.js` on auth state change to warm up the backend before the user reaches a recording screen (see V3.5 in VOCAL_TRAINING.md). Upgrading to a paid Render instance ($7/mo) eliminates the spin-down entirely.

### Dysarthric / Stroke ASR

Whisper is a general-purpose model. Performance degrades on dysarthric speech (reduced intelligibility, irregular rhythm, slurred consonants). SONIVA is available as a Settings toggle and is recommended for post-stroke aphasia users. A fine-tuned dysarthric Whisper model (e.g. trained on the TORGO dataset) would be the ideal long-term replacement and is flagged for post-v1 integration.

### Chunk Boundary Sentence Splitting

The 4-second chunk interval does not align with sentence boundaries. A sentence may be split across two consecutive chunks. The final coherence pass in `enhance-text` is designed to repair these splits, but complex sentences interrupted mid-clause may not always be reconstructed correctly. A future improvement would be to use VAD (Voice Activity Detection) to align chunk boundaries with natural pauses.

---

## 9. Key File Reference

```
frontend/src/
  screens/
    SpeechEnhancementScreen.js     — Main screen: state machine, chunked recording, blob animation, results
    SpeechDemoScreen.js            — Unauthenticated wrapper for guest/demo access
  utils/
    authHeaders.js                 — getAuthHeaders() utility (V3)
  config/
    env.js                         — API_BASE_URL auto-detection (hostUri → port 8000)

backend/
  api/
    speech_routes.py               — /api/transcribe-chunk, /api/enhance-text, /api/process-audio
    audio_routes.py                — /api/audio/{filename} (path traversal protected)
  services/
    clarity_speech.py              — GPT-4o clarity pipeline (per-chunk + final coherence pass)
    enhancement_service.py         — ElevenLabs TTS synthesis
    voice_cloning_service.py       — ElevenLabs voice clone (has_cloned_voice, clone_voice)
  utils/
    auth_dep.py                    — get_current_user FastAPI dependency
  config.py                        — OPENAI_API_KEY, ELEVENLABS_API_KEY, DEFAULT_PROFILE, ALLOWED_ORIGINS
```
