import logging
from openai import OpenAI

from config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

ENABLE_CLARITY = True

# Output must be same length or shorter in almost all cases: we only remove
# artefacts (fillers, repetitions) and split fused words. The 1.1 margin
# covers rare cases where splitting several fused words adds spaces.
MAX_LENGTH_EXPANSION_RATIO = 1.10

# System prompt that primes the model with the clinical context before
# the per-request user prompt is sent.
_SYSTEM_PROMPT = (
    "You are a minimal transcription artefact remover for people with Hypokinetic Dysarthria "
    "caused by Parkinson's disease. You remove only four things: palilalia (word repetitions), "
    "filler sounds (um/uh/ah/er/hmm), non-speech sounds, and unambiguously fused words. "
    "You never add, infer, or change any words. When in doubt, return the text unchanged."
)

# Detailed instruction prompt. Separating it from the system prompt keeps the
# system prompt short (cached by the API) while the detailed rules are sent
# per-request with the actual transcription.
_CORRECTION_PROMPT_TEMPLATE = """\
The text below is a raw Whisper transcription of speech from a person with Hypokinetic \
Dysarthria (Parkinson's disease). Remove transcription artefacts only. \
You must not add, change, or infer any words — this person's exact words must be preserved.

WHAT TO CORRECT — only these four things:

1. Palilalia — involuntary repetition of words or short phrases.
   "I want I want to go home" → "I want to go home"
   "the the the doctor said" → "the doctor said"

2. Filler sounds — um, uh, ah, er, hmm — remove them.
   "Um I want to uh call my daughter" → "I want to call my daughter"

3. Non-speech sounds — throat clearing, coughing, lip smacking, or their
   transcribed forms such as "[clears throat]" or "ahem". Remove them.

4. Fused words — two words run together by Whisper due to rushed speech.
   Only split when the correct split is completely unambiguous.
   "Iwant to leave" → "I want to leave"
   If the split is the slightest bit uncertain, leave it unchanged.

ABSOLUTE RULES — never break these:
- Never add any word that is not already present in the transcription.
- Never remove content words (nouns, verbs, adjectives, adverbs).
- Never complete or extend an unfinished sentence.
- Never rephrase, restructure, or rewrite any part of the sentence.
- Never change the speaker's word choices or intended meaning.
- When in doubt about any correction, return the text exactly as received.
- Fix punctuation and capitalisation only.
- Never wrap the output in quotation marks of any kind.

INPUT TRANSCRIPTION:
"{raw_text}"

Return ONLY the corrected text. If nothing needs correcting, return it exactly as above. \
No explanation, no preamble, no quotation marks."""


_CHUNKED_CORRECTION_PROMPT_TEMPLATE = """\
You are removing artefacts from a real-time transcription chunk for a person with Hypokinetic \
Dysarthria (Parkinson's disease). This person's exact words must be preserved — do not add, \
change, or infer any words.

PREVIOUSLY CORRECTED CONTEXT — for sentence continuity only, do NOT include in your response:
"{context}"

NEW CHUNK TO CORRECT:
"{raw_text}"

Only correct: palilalia (word/phrase repetitions), filler sounds (um, uh, ah, er, hmm), \
non-speech sounds ([clears throat], ahem), and clearly fused words (split only when \
completely unambiguous). Never add words not already in the chunk. Never rephrase. \
When in doubt, return the chunk exactly as received.

Return ONLY the corrected version of the NEW CHUNK. Never repeat or include any text from the \
PREVIOUSLY CORRECTED CONTEXT. If the chunk begins mid-sentence, start your response from that \
mid-sentence point. Never wrap the output in quotation marks."""


def _strip_wrapping_quotes(text: str) -> str:
    """Remove outer quotation marks GPT sometimes wraps the whole response in."""
    t = text.strip()
    if len(t) >= 2 and (
        (t.startswith('"') and t.endswith('"')) or
        (t.startswith('“') and t.endswith('”')) or  # " "
        (t.startswith("'") and t.endswith("'"))
    ):
        t = t[1:-1].strip()
    return t


def clarity_transcript_chunked(raw_text: str, context: str = "") -> str:
    """
    Enhance a single chunk with awareness of the previous enhanced text.
    Used during real-time recording so the user sees corrected speech per chunk.
    Falls back to context-free clarity when context is empty.
    """
    if not raw_text or len(raw_text.strip()) < 3:
        return raw_text

    if not context.strip():
        return clarity_transcript(raw_text)

    if not ENABLE_CLARITY or not OPENAI_API_KEY:
        return raw_text

    # Keep only the tail of the context to stay within token budget
    context_window = context[-400:] if len(context) > 400 else context

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _CHUNKED_CORRECTION_PROMPT_TEMPLATE.format(
                        context=context_window,
                        raw_text=raw_text,
                    ),
                },
            ],
            temperature=0.15,
            max_tokens=300,
        )

        cleaned = _strip_wrapping_quotes(response.choices[0].message.content.strip())
        if not cleaned:
            return raw_text

        if len(cleaned) > len(raw_text) * MAX_LENGTH_EXPANSION_RATIO:
            logger.warning("Chunked clarity output too long, discarding")
            return raw_text

        return cleaned

    except Exception as exc:
        logger.warning("Chunked clarity failed, returning raw: %s", exc)
        return raw_text


def clarity_transcript(raw_text: str) -> str:
    """
    Remove Hypokinetic Dysarthria transcription artefacts from a raw Whisper output.

    Only removes: palilalia (word repetitions), filler sounds (um/uh/ah/er/hmm),
    non-speech sounds, and unambiguously fused words. Never adds or changes words.

    Falls back to the raw transcription on any error so the caller is
    never blocked by a failed correction.
    """
    if not raw_text or len(raw_text.strip()) < 3:
        return raw_text

    if not ENABLE_CLARITY or not OPENAI_API_KEY:
        return raw_text

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _CORRECTION_PROMPT_TEMPLATE.format(raw_text=raw_text),
                },
            ],
            # Low temperature keeps corrections deterministic and literal.
            # A small non-zero value prevents the model from being overconfident
            # about ambiguous restorations.
            temperature=0.15,
            max_tokens=500,
        )

        cleaned = _strip_wrapping_quotes(response.choices[0].message.content.strip())

        if not cleaned:
            return raw_text

        # Guard against hallucination: if the model substantially expands the
        # text, it has likely added content rather than just correcting artefacts.
        if len(cleaned) > len(raw_text) * MAX_LENGTH_EXPANSION_RATIO:
            logger.warning(
                "Clarity output too long (%.1fx raw), discarding",
                len(cleaned) / len(raw_text),
            )
            return raw_text

        return cleaned

    except Exception as exc:
        logger.warning("Clarity enhancement failed, returning raw text: %s", exc)
        return raw_text
