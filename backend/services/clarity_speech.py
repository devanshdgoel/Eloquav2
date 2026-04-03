import logging
from openai import OpenAI

from config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

ENABLE_CLARITY = True

# Allow the corrected text to be up to 40% longer than the raw transcription.
# Parkinson's patients frequently omit function words, so restoration can
# legitimately increase length beyond what a generic 1.3x ratio permits.
MAX_LENGTH_EXPANSION_RATIO = 1.4

# System prompt that primes the model with the clinical context before
# the per-request user prompt is sent.
_SYSTEM_PROMPT = (
    "You are a precise assistive speech corrector for people with Hypokinetic Dysarthria "
    "caused by Parkinson's disease. You correct transcription artefacts caused by the "
    "condition — nothing more. You never paraphrase, never add content, and never change "
    "the speaker's intended meaning or vocabulary."
)

# Detailed instruction prompt. Separating it from the system prompt keeps the
# system prompt short (cached by the API) while the detailed rules are sent
# per-request with the actual transcription.
_CORRECTION_PROMPT_TEMPLATE = """\
The text below is a raw Whisper transcription of speech from a person with Hypokinetic \
Dysarthria (Parkinson's disease). Their condition produces specific, predictable \
transcription artefacts. Correct for those artefacts only.

COMMON ARTEFACTS TO FIX:

1. Palilalia — involuntary repetition of words or short phrases.
   Example: "I want I want to go home" → "I want to go home"
   Example: "the the the doctor said" → "the doctor said"

2. False starts and self-corrections — the speaker restarts mid-sentence.
   Example: "I need to— I want to call my daughter" → "I want to call my daughter"
   Example: "Can you can you please help" → "Can you please help"

3. Filler sounds — um, uh, ah, er, hmm. Remove all of them.

4. Non-speech sounds — throat clearing, coughing, lip smacking. Remove any
   transcribed artefacts from these (e.g. "hmm", "[clears throat]", "ahem").

5. Missing function words — Parkinson's patients frequently omit articles,
   prepositions, and conjunctions due to reduced motor precision. Restore
   them ONLY when the correct word is grammatically unambiguous.
   Example: "I went shop yesterday" → "I went to the shop yesterday"
   Example: "give me glass water" → "give me a glass of water"
   Do NOT restore if there is any ambiguity about which word belongs.

6. Fused words from festination (rushed speech) — if Whisper has run two
   words together, split them only when the correct split is unambiguous.
   Example: "Iwant to leave" → "I want to leave"

RULES:
- Never add, change, or infer content words (nouns, verbs, adjectives, adverbs).
- Never complete an unfinished sentence beyond restoring missing function words.
- Never paraphrase or restructure a sentence.
- Never change the speaker's word choices.
- Preserve the speaker's exact intent and all factual content.
- Fix punctuation and capitalisation normally.

INPUT TRANSCRIPTION:
"{raw_text}"

Return ONLY the corrected text. No explanation, no preamble, no quotation marks."""


def clarity_transcript(raw_text: str) -> str:
    """
    Apply Hypokinetic Dysarthria-aware clarity enhancement to a raw Whisper
    transcription.

    Targets the specific artefacts produced by Parkinson's speech:
    palilalia, false starts, missing function words, filler sounds, and
    festination-induced fused words.

    Falls back to the raw transcription on any error so the caller is
    never blocked by a failed enhancement.
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

        cleaned = response.choices[0].message.content.strip()

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
