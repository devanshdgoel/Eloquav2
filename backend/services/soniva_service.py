"""
SONIVA transcription service — wraps the fine-tuned Whisper Medium model from:
  https://github.com/Clinical-Language-Cognition-Lab/SONIVA_paper

Setup (one-time):
  1. Clone the SONIVA_paper repo and navigate to ASR_finetuned/
  2. Reassemble the split archive:
       cat whisper-medium-finetuned.tar.gz.part-* > whisper-medium-finetuned.tar.gz
  3. Extract:
       tar -xzf whisper-medium-finetuned.tar.gz
  4. Copy or symlink the extracted directory as  backend/soniva_model/
     (or set the SONIVA_MODEL_PATH env var to point elsewhere)

Extra dependencies (not in requirements.txt — Render free tier can't run this):
  pip install torch transformers librosa soundfile

Memory requirements: ~2–4 GB RAM. Render Starter ($7/mo) or local backend only.
"""

import logging
import os
from pathlib import Path

from services.speech_service import TranscriptionError

logger = logging.getLogger(__name__)

# ── Model location ────────────────────────────────────────────────────────────
_DEFAULT_MODEL_PATH = Path(__file__).parent.parent / "soniva_model"
SONIVA_MODEL_PATH = Path(os.environ.get("SONIVA_MODEL_PATH", str(_DEFAULT_MODEL_PATH)))

# Lazy-loaded singletons — loaded on first transcription call, not at startup.
_model     = None
_processor = None
_device    = None


def is_available() -> bool:
    """True if the model directory exists on disk (weights downloaded)."""
    return SONIVA_MODEL_PATH.exists() and SONIVA_MODEL_PATH.is_dir()


def _load_model() -> bool:
    """
    Load the model into memory on first use.
    Returns True on success, False if the directory is missing or deps absent.
    """
    global _model, _processor, _device

    if _model is not None:
        return True

    if not is_available():
        logger.warning(
            "SONIVA model not found at %s. "
            "Follow the setup instructions in soniva_service.py.",
            SONIVA_MODEL_PATH,
        )
        return False

    try:
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor

        logger.info("Loading SONIVA model from %s (first use — may take ~30 s)", SONIVA_MODEL_PATH)
        _processor = WhisperProcessor.from_pretrained(str(SONIVA_MODEL_PATH))
        _model     = WhisperForConditionalGeneration.from_pretrained(str(SONIVA_MODEL_PATH))
        _model.eval()
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        _model.to(_device)
        logger.info("SONIVA model ready on %s", _device)
        return True

    except ImportError as e:
        logger.error(
            "SONIVA dependencies missing (%s). "
            "Run: pip install torch transformers librosa soundfile",
            e,
        )
        return False
    except Exception as e:
        logger.error("Failed to load SONIVA model: %s", e)
        return False


def _apply_language_forcing(generate_kwargs: dict) -> None:
    """Force English transcription via forced_decoder_ids when no prompt_ids are set."""
    try:
        generate_kwargs["forced_decoder_ids"] = _processor.get_decoder_prompt_ids(
            language="english", task="transcribe"
        )
    except Exception as e:
        logger.warning("SONIVA language forcing unavailable (%s)", e)


def transcribe_soniva(audio_path: str, prompt: str = "") -> tuple:
    """
    Transcribe an audio file using the SONIVA fine-tuned Whisper Medium model.

    Returns (text: str, duration_seconds: float).
    Input audio is resampled to 16 kHz automatically via librosa.
    Accepts any format supported by librosa (wav, m4a, mp3, ogg, …).

    prompt: optional previous transcript text for cross-chunk context continuity,
            mirroring the Whisper API's prompt parameter.  When supplied, the
            model receives it as a decoder prefix (prompt_ids) which dramatically
            improves accuracy at chunk boundaries.  Also forces English output so
            that silence or noise cannot produce random-language hallucinations.

    Raises TranscriptionError on failure so callers can handle it uniformly
    alongside the standard Whisper path.
    """
    if not _load_model():
        raise TranscriptionError(
            error_type="internal",
            message=(
                "SONIVA model is not available on this server. "
                "Switch to Whisper in Settings, or run the backend locally "
                "with the model weights installed."
            ),
        )

    try:
        import torch
        import librosa

        audio_array, _ = librosa.load(audio_path, sr=16000, mono=True)
        duration = float(len(audio_array) / 16000)

        input_features = _processor(
            audio_array,
            sampling_rate=16000,
            return_tensors="pt",
        ).input_features.to(_device)

        generate_kwargs: dict = {}

        # Context prompt takes priority over plain language forcing.
        # When prompt_ids is provided, forced_decoder_ids must NOT also be set
        # (they operate on the same decoder positions and conflict).
        if prompt.strip():
            try:
                prompt_ids = _processor.get_prompt_ids(
                    prompt[-800:], return_tensors="pt"
                ).to(_device)
                generate_kwargs["prompt_ids"] = prompt_ids
                # prompt_ids already steers the decoder; no forced_decoder_ids needed
            except Exception as e:
                logger.warning(
                    "SONIVA prompt_ids failed (%s) — falling back to language forcing", e
                )
                _apply_language_forcing(generate_kwargs)
        else:
            # No context — force English/transcribe so silence/noise cannot produce
            # random-language output that slips past the hallucination filter.
            _apply_language_forcing(generate_kwargs)

        with torch.no_grad():
            predicted_ids = _model.generate(input_features, **generate_kwargs)

        text = _processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()

        if not text:
            raise TranscriptionError(
                error_type="empty",
                message="No speech detected in the audio.",
            )

        logger.debug("SONIVA transcribed: %r (%.1f s)", text[:80], duration)
        return text, duration

    except TranscriptionError:
        raise
    except Exception as exc:
        logger.error("SONIVA transcription failed: %s", exc)
        raise TranscriptionError(
            error_type="internal",
            message=f"SONIVA transcription error: {exc}",
        )
