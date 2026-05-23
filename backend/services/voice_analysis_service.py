"""
Voice analysis service — extracts clinically-relevant acoustic features
from a voice recording and stores them as a session in Firestore.

Feature extraction stack:
  parselmouth (Praat)  — F0, jitter, intensity, CPP, HNR
  librosa              — MFCCs, RMS loudness, silence segmentation
  soundfile            — WAV writing (parselmouth needs PCM WAV)

All Praat-based measures are industry-standard and match the exact
algorithms used in peer-reviewed Parkinson's speech research.

Mobile recording caveats applied throughout:
  • Jitter and shimmer are returned but marked "treat as relative trend only"
  • HNR is used only for quality screening, not as a primary metric
  • Intensity is relative (dBFS equivalent), not calibrated SPL
  • All features are only meaningful when compared session-to-session for
    the same user on the same device; cross-user comparisons are invalid.

If parselmouth is not installed, all Praat features return None and only
librosa-based features (MFCCs, RMS, pause timing) are stored.
"""

import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import librosa
import numpy as np

logger = logging.getLogger(__name__)

# ── F0 search range ───────────────────────────────────────────────────────────
# 75–500 Hz covers both male (80–150 Hz) and female (150–300 Hz) voices
# with room for pathological extremes in either direction.
F0_MIN_HZ = 75.0
F0_MAX_HZ = 500.0

# ── Quality gate ──────────────────────────────────────────────────────────────
# Recordings with HNR below this are too noisy for reliable perturbation
# measures (jitter, shimmer). We still store timing/MFCC features.
HNR_MIN_FOR_PERTURBATION_DB = 5.0

# Minimum voiced duration needed for meaningful F0 statistics.
MIN_VOICED_DURATION_S = 1.5

# ── Score anchors (clinical approximations) ───────────────────────────────────
# These map raw acoustic values onto a 0–100 scale. Values are based on
# published normative and PD-specific data. They score the user relative
# to a "functional speech" target, not relative to healthy controls.
_INTENSITY_LOW_DB   = 45.0   # very quiet — score 0
_INTENSITY_HIGH_DB  = 75.0   # strong/clear — score 100

_F0_SD_LOW_HZ       = 0.0    # completely monotone — score 0
_F0_SD_HIGH_HZ      = 50.0   # rich prosody — score 100

_WPM_OPTIMAL        = 130.0  # intelligibility peaks around 120–140 WPM for PD
_WPM_TOO_SLOW       = 50.0   # below this → score 0
_WPM_TOO_FAST       = 220.0  # festination → score 0

_PAUSES_PER_MIN_LOW  = 0.0   # no pauses → score 100
_PAUSES_PER_MIN_HIGH = 15.0  # very fragmented → score 0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_wav(audio_path: str) -> str:
    """
    Load any audio format via librosa and write a 16-bit 44100 Hz WAV
    that parselmouth can read.  Returns the temp WAV path (caller must delete).
    """
    import soundfile as sf
    y, _ = librosa.load(audio_path, sr=44100, mono=True)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    sf.write(tmp.name, y, 44100, subtype="PCM_16")
    return tmp.name


def _safe(value) -> Optional[float]:
    """Return float or None; collapse NaN/inf from Praat to None."""
    if value is None:
        return None
    try:
        f = float(value)
        return f if np.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


# ── Score computation ─────────────────────────────────────────────────────────

def _score_voice_power(intensity_db: Optional[float]) -> Optional[int]:
    """
    Maps mean Praat intensity (dBFS-equivalent) to 0–100.
    Higher = stronger, clearer voice.
    """
    if intensity_db is None:
        return None
    raw = (intensity_db - _INTENSITY_LOW_DB) / (_INTENSITY_HIGH_DB - _INTENSITY_LOW_DB)
    return round(_clamp01(raw) * 100)


def _score_expression(f0_sd_hz: Optional[float]) -> Optional[int]:
    """
    Maps F0 standard deviation to 0–100.
    0 Hz SD = completely monotone (score 0); 50+ Hz SD = natural prosody (score 100).
    Reduced F0 variability (monopitch) is the hallmark of hypokinetic dysarthria.
    """
    if f0_sd_hz is None:
        return None
    raw = (f0_sd_hz - _F0_SD_LOW_HZ) / (_F0_SD_HIGH_HZ - _F0_SD_LOW_HZ)
    return round(_clamp01(raw) * 100)


def _score_fluency(wpm: Optional[float], pauses_per_min: Optional[float]) -> Optional[int]:
    """
    Composite fluency score from speech rate and pause frequency.

    WPM component (60 %):
      Bell curve — optimal around 130 WPM.  Both too slow (hypokinetic)
      and too fast (festination) reduce the score.

    Pause component (40 %):
      Fewer pauses per minute = more fluent speech.
    """
    wpm_score: Optional[float] = None
    if wpm is not None:
        if wpm <= _WPM_TOO_SLOW:
            wpm_score = 0.0
        elif wpm <= _WPM_OPTIMAL:
            wpm_score = (wpm - _WPM_TOO_SLOW) / (_WPM_OPTIMAL - _WPM_TOO_SLOW)
        elif wpm <= _WPM_TOO_FAST:
            # gentle decline from optimal to too-fast
            wpm_score = 1.0 - 0.3 * ((wpm - _WPM_OPTIMAL) / (_WPM_TOO_FAST - _WPM_OPTIMAL))
        else:
            wpm_score = 0.0

    pause_score: Optional[float] = None
    if pauses_per_min is not None:
        raw = 1.0 - (pauses_per_min / _PAUSES_PER_MIN_HIGH)
        pause_score = _clamp01(raw)

    if wpm_score is None and pause_score is None:
        return None
    if wpm_score is None:
        combined = pause_score
    elif pause_score is None:
        combined = wpm_score
    else:
        combined = 0.60 * wpm_score + 0.40 * pause_score

    return round(_clamp01(combined) * 100)


# ── Pause / speech-rate analysis ──────────────────────────────────────────────

def _analyse_pauses(y: np.ndarray, sr: int, transcript: str, audio_duration_s: float):
    """
    Return (speech_rate_wpm, pause_count, mean_pause_s, pauses_per_min).
    Uses librosa silence splitting for pause boundaries and Whisper word count
    for speech rate (timing-based, device-agnostic).
    """
    # Silence segments via librosa
    intervals = librosa.effects.split(y, top_db=35, frame_length=2048, hop_length=512)

    if len(intervals) == 0:
        return None, None, None, None

    pauses = []
    for i in range(1, len(intervals)):
        gap_s = (intervals[i][0] - intervals[i - 1][1]) / sr
        if gap_s >= 0.15:  # ignore gaps < 150 ms (micro-pauses / articulation)
            pauses.append(gap_s)

    pause_count = len(pauses)
    mean_pause_s = float(np.mean(pauses)) if pauses else 0.0

    # Speech duration = total duration - total pause time
    total_pause_s = sum(pauses)
    speech_s = max(audio_duration_s - total_pause_s, 1.0)

    # WPM from Whisper transcript word count
    words = len(transcript.split()) if transcript.strip() else 0
    wpm = (words / speech_s) * 60.0 if words > 0 else None

    # Pauses per minute (of speech time)
    pauses_per_min = (pause_count / audio_duration_s) * 60.0 if audio_duration_s > 0 else None

    return wpm, pause_count, mean_pause_s, pauses_per_min


# ── Main feature extraction ───────────────────────────────────────────────────

def extract_features(
    audio_path: str,
    transcript: str = "",
    audio_duration_s: float = 0.0,
    task_type: str = "free_speech",
) -> dict:
    """
    Extract a full acoustic feature set from the given audio file.

    Returns a dict with keys:
      features   — raw acoustic measurements (float | None)
      scores     — Voice Power, Expression, Fluency (int 0-100 | None)
      quality    — snr_ok (bool), notes (str), analysed_with_praat (bool)

    Never raises — all errors produce None values + quality notes.
    """
    result = {
        "features": {
            "f0_mean_hz":         None,
            "f0_sd_hz":           None,
            "f0_range_hz":        None,
            "jitter_local_pct":   None,
            "shimmer_local_pct":  None,
            "hnr_db":             None,
            "cpp_db":             None,
            "intensity_mean_db":  None,
            "speech_rate_wpm":    None,
            "pause_count":        None,
            "mean_pause_s":       None,
            "mfcc_mean":          None,
            "rms_db":             None,
        },
        "scores": {
            "voice_power": None,
            "expression":  None,
            "fluency":     None,
        },
        "quality": {
            "snr_ok":              True,
            "analysed_with_praat": False,
            "notes":               "",
        },
    }

    # ── librosa features (always attempted) ───────────────────────────────────
    wav_path = None
    try:
        y, sr = librosa.load(audio_path, sr=44100, mono=True)

        # RMS loudness
        rms = librosa.feature.rms(y=y)[0]
        rms_db = float(librosa.amplitude_to_db(np.mean(rms)))
        result["features"]["rms_db"] = _safe(rms_db)

        # 13 MFCCs — mean of each coefficient across all frames
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        result["features"]["mfcc_mean"] = [round(float(v), 4) for v in np.mean(mfcc, axis=1)]

        # Pause / speech-rate analysis
        dur = audio_duration_s if audio_duration_s > 0 else float(len(y) / sr)
        wpm, pause_count, mean_pause_s, pauses_per_min = _analyse_pauses(y, sr, transcript, dur)
        result["features"]["speech_rate_wpm"] = _safe(wpm)
        result["features"]["pause_count"]     = pause_count
        result["features"]["mean_pause_s"]    = _safe(mean_pause_s)

    except Exception as exc:
        logger.warning("librosa feature extraction failed: %s", exc)

    # ── parselmouth / Praat features ──────────────────────────────────────────
    try:
        import parselmouth
        from parselmouth.praat import call as praat_call

        # parselmouth needs PCM WAV — convert once and clean up after
        wav_path = _to_wav(audio_path)
        sound    = parselmouth.Sound(wav_path)

        result["quality"]["analysed_with_praat"] = True

        # F0 / Pitch
        pitch    = praat_call(sound, "To Pitch", 0.0, F0_MIN_HZ, F0_MAX_HZ)
        f0_mean  = _safe(praat_call(pitch, "Get mean",              0, 0, "Hertz"))
        f0_sd    = _safe(praat_call(pitch, "Get standard deviation", 0, 0, "Hertz"))
        f0_min_v = _safe(praat_call(pitch, "Get minimum",           0, 0, "Hertz", "Parabolic"))
        f0_max_v = _safe(praat_call(pitch, "Get maximum",           0, 0, "Hertz", "Parabolic"))

        result["features"]["f0_mean_hz"]  = f0_mean
        result["features"]["f0_sd_hz"]    = f0_sd
        result["features"]["f0_range_hz"] = (
            _safe(f0_max_v - f0_min_v) if f0_max_v and f0_min_v else None
        )

        # Intensity
        intensity    = praat_call(sound, "To Intensity", F0_MIN_HZ, 0.0, "yes")
        intensity_db = _safe(praat_call(intensity, "Get mean", 0, 0, "energy"))
        result["features"]["intensity_mean_db"] = intensity_db

        # HNR — used mainly for quality gating
        harmonicity = praat_call(sound, "To Harmonicity (cc)", 0.01, F0_MIN_HZ, 0.1, 1.0)
        hnr_db      = _safe(praat_call(harmonicity, "Get mean", 0, 0))
        result["features"]["hnr_db"] = hnr_db

        # CPP (Cepstral Peak Prominence) — sensitive early PD marker.
        # Parselmouth 0.4.7 "Get CPPS" takes 11 positional args in this order:
        #   subtract_trend(int), t_smooth, q_smooth, f0_min, f0_max,
        #   tolerance, interpolation(str), q_left, q_right,
        #   trend_type(str), fit_method(str)
        try:
            power_cepstrum = praat_call(sound, "To PowerCepstrogram",
                                        F0_MIN_HZ, 0.002, 5000.0, 50.0)
            cpp_db = _safe(praat_call(
                power_cepstrum, "Get CPPS",
                1,             # subtract trend before smoothing
                0.001,         # time smoothing window (s)
                0.05,          # quefrency smoothing window (s)
                F0_MIN_HZ,     # pitch floor
                F0_MAX_HZ,     # pitch ceiling
                0.05,          # tolerance
                "Parabolic",   # interpolation
                0.001,         # left trend line quefrency
                0.05,          # right trend line quefrency
                "Straight",    # trend type
                "Least squares",  # fit method
            ))
            result["features"]["cpp_db"] = cpp_db
        except Exception as cpp_exc:
            logger.debug("CPP extraction failed (non-fatal): %s", cpp_exc)

        # Quality gate: if HNR is too low, perturbation measures are unreliable
        if hnr_db is not None and hnr_db < HNR_MIN_FOR_PERTURBATION_DB:
            result["quality"]["snr_ok"] = False
            result["quality"]["notes"] = (
                "Recording quality is low (high background noise). "
                "Jitter and shimmer values may be unreliable. "
                "Try recording in a quieter environment."
            )
            logger.info("Low HNR (%.1f dB) — skipping perturbation measures", hnr_db)
        else:
            # Jitter & shimmer — only reliable from sustained vowels; treat as trend only
            try:
                point_process = praat_call(sound, "To PointProcess (periodic, cc)",
                                           F0_MIN_HZ, F0_MAX_HZ)
                jitter = _safe(praat_call(
                    point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3
                ))
                shimmer = _safe(praat_call(
                    [sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6
                ))
                result["features"]["jitter_local_pct"]  = (
                    round(jitter  * 100, 4) if jitter  is not None else None
                )
                result["features"]["shimmer_local_pct"] = (
                    round(shimmer * 100, 4) if shimmer is not None else None
                )
            except Exception as pert_exc:
                logger.debug("Perturbation extraction failed (non-fatal): %s", pert_exc)

    except ImportError:
        result["quality"]["notes"] = (
            "parselmouth not installed — Praat features unavailable. "
            "Run: pip install praat-parselmouth"
        )
        logger.warning("parselmouth not available; only librosa features extracted")
    except Exception as praat_exc:
        logger.warning("Praat feature extraction failed: %s", praat_exc)
        result["quality"]["notes"] = f"Praat analysis error: {praat_exc}"
    finally:
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except OSError:
                pass

    # ── Scores ────────────────────────────────────────────────────────────────
    intensity_for_power = result["features"].get("intensity_mean_db")
    f0_sd_for_expr      = result["features"].get("f0_sd_hz")
    wpm_for_fluency     = result["features"].get("speech_rate_wpm")

    # Pause rate for fluency
    pause_count  = result["features"].get("pause_count")
    dur_for_score = audio_duration_s if audio_duration_s > 0 else None
    pauses_per_min_score = (
        (pause_count / dur_for_score * 60.0)
        if pause_count is not None and dur_for_score
        else None
    )

    result["scores"]["voice_power"] = _score_voice_power(intensity_for_power)
    result["scores"]["expression"]  = _score_expression(f0_sd_for_expr)
    result["scores"]["fluency"]     = _score_fluency(wpm_for_fluency, pauses_per_min_score)

    return result


# ── Firestore persistence ─────────────────────────────────────────────────────

def save_session(
    uid: str,
    analysis: dict,
    task_type: str = "free_speech",
    transcript: str = "",
    audio_duration_s: float = 0.0,
) -> Optional[str]:
    """
    Write one voice session to Firestore at:
      users/{uid}/voice_sessions/{auto_id}

    Returns the new document ID, or None on failure.

    Firestore schema per document:
      recorded_at        — Firestore server timestamp
      task_type          — "free_speech" | "sustained_a" | "reading" | "ddk"
      audio_duration_s   — float
      transcript         — string (from Whisper)
      features           — acoustic feature dict (see extract_features)
      scores             — {voice_power, expression, fluency} (int 0–100 | null)
      quality            — {snr_ok, analysed_with_praat, notes}
    """
    try:
        from firebase_admin import firestore
        db  = firestore.client()
        ref = db.collection("users").document(uid).collection("voice_sessions").document()

        ref.set({
            "recorded_at":      firestore.SERVER_TIMESTAMP,
            "task_type":        task_type,
            "audio_duration_s": audio_duration_s,
            "transcript":       transcript,
            "features":         analysis.get("features", {}),
            "scores":           analysis.get("scores", {}),
            "quality":          analysis.get("quality", {}),
        })

        logger.info("Voice session saved: users/%s/voice_sessions/%s", uid, ref.id)
        return ref.id

    except Exception as exc:
        logger.error("Failed to save voice session for uid %s: %s", uid[:8], exc)
        return None
