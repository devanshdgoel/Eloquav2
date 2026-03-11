"""
Voice profile matching.

Analyses pitch, speaking rate, and energy from a recording, then selects the
closest of 9 ElevenLabs pre-made voices.

Grid (pitch × speed):
              Slow (<120 WPM)    Medium (120-175)   Fast (>175 WPM)
Low  (<145Hz) Thomas             Daniel             Adam
Mid  (145-220) Antoni            Josh               Charlie
High (>220Hz) Rachel             Bella              Elli
"""

import logging
from dataclasses import dataclass, asdict

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class VoiceProfile:
    name: str
    description: str
    voice_id: str
    speaking_rate: float   # passed to ElevenLabs as voice_settings.speed
    pitch_label: str       # low / mid / high
    speed_label: str       # slow / medium / fast

    def to_dict(self):
        return {
            "name": self.name,
            "description": self.description,
            "pitch": self.pitch_label,
            "speed": self.speed_label,
        }


# ── 3×3 profile grid ────────────────────────────────────────────────────────
# Index: PROFILES[pitch_idx][speed_idx]  (0=low, 1=mid, 2=high / slow)

PROFILES = [
    [  # Low pitch
        VoiceProfile("Thomas",  "Deep & Deliberate", "GBv7mTt0atIp3Br8iCZE", 0.82, "low", "slow"),
        VoiceProfile("Daniel",  "Deep & Steady",     "onwK4e9ZLuTAKqWW03F9", 1.00, "low", "medium"),
        VoiceProfile("Adam",    "Deep & Energetic",  "pNInz6obpgDQGcFmaJgB", 1.15, "low", "fast"),
    ],
    [  # Mid pitch
        VoiceProfile("Antoni",  "Warm & Thoughtful", "ErXwobaYiN019PkySvjV", 0.82, "mid", "slow"),
        VoiceProfile("Josh",    "Balanced & Natural","TxGEqnHWrfWFTfGW9XjX", 1.00, "mid", "medium"),
        VoiceProfile("Charlie", "Natural & Quick",   "IKne3meq5aSn9XLyUdCD", 1.15, "mid", "fast"),
    ],
    [  # High pitch
        VoiceProfile("Rachel",  "Clear & Careful",   "21m00Tcm4TlvDq8ikWAM", 0.82, "high", "slow"),
        VoiceProfile("Bella",   "Bright & Steady",   "EXAVITQu4vr4xnSDxMaL", 1.00, "high", "medium"),
        VoiceProfile("Elli",    "Bright & Dynamic",  "MF3mGyEYCl7XYWbV9V6O", 1.15, "high", "fast"),
    ],
]

DEFAULT_PROFILE = PROFILES[1][1]  # Josh — balanced fallback


# ── Classification helpers ───────────────────────────────────────────────────

def _pitch_idx(hz: float) -> int:
    if hz < 145:
        return 0
    if hz < 220:
        return 1
    return 2


def _speed_idx(wpm: float) -> int:
    if wpm < 120:
        return 0
    if wpm < 175:
        return 1
    return 2


def _energy_settings(mean_rms: float) -> dict:
    """
    Map RMS energy → ElevenLabs stability + style.
    Quiet → controlled (high stability).  Loud → expressive (low stability).
    """
    if mean_rms < 0.025:
        return {"stability": 0.75, "style": 0.05, "similarity_boost": 0.75}
    if mean_rms < 0.07:
        return {"stability": 0.50, "style": 0.30, "similarity_boost": 0.75}
    return {"stability": 0.30, "style": 0.55, "similarity_boost": 0.75}


# ── Main entry point ─────────────────────────────────────────────────────────

def analyze_voice(audio_path: str, transcript: str, audio_duration_s: float) -> tuple:
    """
    Returns (VoiceProfile, voice_settings_dict).

    audio_duration_s comes from the Whisper verbose_json response so it is
    always available even when librosa cannot load the audio format.
    """
    # ── Speaking rate (always computable) ───────────────────────────────────
    word_count = len(transcript.split()) if transcript.strip() else 0
    duration = max(audio_duration_s, 0.5)
    wpm = (word_count / duration) * 60.0 if word_count > 0 else 140.0

    # ── Pitch + Energy via librosa (best-effort) ─────────────────────────────
    mean_pitch = 170.0   # default mid
    mean_rms   = 0.045   # default mid energy

    try:
        import librosa  # noqa: PLC0415

        y, sr = librosa.load(audio_path, sr=None, mono=True)

        # Pitch
        f0, voiced_flag, _ = librosa.pyin(
            y, fmin=65, fmax=500, sr=sr,
            frame_length=2048, hop_length=512,
        )
        valid_f0 = f0[voiced_flag & ~np.isnan(f0)] if f0 is not None else np.array([])
        if len(valid_f0) > 5:
            mean_pitch = float(np.mean(valid_f0))

        # Energy
        mean_rms = float(np.mean(librosa.feature.rms(y=y)))

        logger.info(
            "Voice analysis — pitch=%.1f Hz | speed=%.0f WPM | energy=%.4f",
            mean_pitch, wpm, mean_rms,
        )

    except Exception as exc:
        logger.warning("Librosa analysis failed (%s) — using pitch/energy defaults", exc)

    pitch_i = _pitch_idx(mean_pitch)
    speed_i  = _speed_idx(wpm)
    profile  = PROFILES[pitch_i][speed_i]
    settings = _energy_settings(mean_rms)
    settings["speed"] = profile.speaking_rate   # ElevenLabs voice_settings.speed

    logger.info("Matched profile: %s — %s", profile.name, profile.description)
    return profile, settings
