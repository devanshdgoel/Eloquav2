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


# ── Stroke aphasia prompts ────────────────────────────────────────────────────

_APHASIA_SYSTEM_PROMPT = (
    "You are a minimal transcription artefact remover for people with post-stroke aphasia. "
    "Aphasia is a language disorder — intelligence is fully intact. The speaker's word choices, "
    "including telegraphic speech, missing words, and word substitutions, are their intentional "
    "communication and must never be changed. "
    "You remove only: exact consecutive word repetitions, filler sounds (um/uh/ah/er/hmm), "
    "and non-speech sounds. You never add, infer, or complete any words. When in doubt, "
    "return the text unchanged."
)

_APHASIA_CORRECTION_PROMPT_TEMPLATE = """\
The text below is a raw Whisper transcription of speech from a person with post-stroke aphasia.

Aphasia is a language disorder — the person's intelligence is fully intact. Their speech may be \
telegraphic (missing words), effortful, or include word substitutions (saying one word when they \
mean another). Every word they DID say is intentional and must be preserved exactly.

WHAT TO CORRECT — only these three things:

1. Exact consecutive word or phrase repetitions only.
   "I want want to go" → "I want to go"
   "my my daughter" → "my daughter"
   Do NOT remove a word unless it is an exact consecutive duplicate.

2. Filler sounds — um, uh, ah, er, hmm — remove them.
   "Um I want uh phone" → "I want phone"

3. Non-speech sounds — throat clearing, coughing, or their transcribed forms \
([clears throat], ahem). Remove them.

ABSOLUTE RULES — never break these:
- Never add any word not already present in the transcription.
- Telegraphic speech (e.g. "want phone", "go doctor", "daughter call") is intentional — \
do not add missing articles, prepositions, verbs, or any other words.
- Never correct word substitutions — the word the person said is their word, even if it \
seems unusual in context.
- Never complete or extend an unfinished sentence.
- Never rephrase or restructure anything.
- When in doubt, return the text exactly as received.
- Fix punctuation and capitalisation only.
- Never wrap the output in quotation marks of any kind.

INPUT TRANSCRIPTION:
"{raw_text}"

Return ONLY the corrected text. If nothing needs correcting, return it exactly as above. \
No explanation, no preamble, no quotation marks."""


_APHASIA_CHUNKED_CORRECTION_PROMPT_TEMPLATE = """\
You are removing artefacts from a real-time transcription chunk for a person with post-stroke \
aphasia. Their exact words — including telegraphic speech and word substitutions — must be \
preserved entirely. Do not add, change, infer, or complete any words.

PREVIOUSLY CORRECTED CONTEXT — for continuity only, do NOT include in your response:
"{context}"

NEW CHUNK TO CORRECT:
"{raw_text}"

Only remove: exact consecutive word repetitions, filler sounds (um, uh, ah, er, hmm), and \
non-speech sounds ([clears throat], ahem). Never add words. Never complete sentences. \
When in doubt, return the chunk exactly as received.

Return ONLY the corrected version of the NEW CHUNK. Never include text from the context. \
If the chunk begins mid-sentence, start from that point. Never wrap in quotation marks."""


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


def clarity_transcript_chunked(raw_text: str, context: str = "", condition: str = "parkinsons") -> str:
    """
    Remove artefacts from a single chunk with awareness of the previous corrected text.
    Used during real-time recording so the user sees corrected speech per chunk.
    Falls back to context-free clarity when context is empty.

    condition: "parkinsons" (hypokinetic dysarthria) | "aphasia" (post-stroke aphasia)
    """
    if not raw_text or len(raw_text.strip()) < 3:
        return raw_text

    if not context.strip():
        return clarity_transcript(raw_text, condition)

    if not ENABLE_CLARITY or not OPENAI_API_KEY:
        return raw_text

    if condition == "aphasia":
        system_prompt    = _APHASIA_SYSTEM_PROMPT
        chunked_template = _APHASIA_CHUNKED_CORRECTION_PROMPT_TEMPLATE
    else:
        system_prompt    = _SYSTEM_PROMPT
        chunked_template = _CHUNKED_CORRECTION_PROMPT_TEMPLATE

    # Keep only the tail of the context to stay within token budget
    context_window = context[-400:] if len(context) > 400 else context

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": chunked_template.format(
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


def clarity_transcript(raw_text: str, condition: str = "parkinsons") -> str:
    """
    Remove transcription artefacts from a raw Whisper output.

    condition: "parkinsons" (hypokinetic dysarthria) | "aphasia" (post-stroke aphasia)

    Never adds or changes words. Falls back to the raw transcription on any error
    so the caller is never blocked by a failed correction.
    """
    if not raw_text or len(raw_text.strip()) < 3:
        return raw_text

    if not ENABLE_CLARITY or not OPENAI_API_KEY:
        return raw_text

    if condition == "aphasia":
        system_prompt    = _APHASIA_SYSTEM_PROMPT
        user_template    = _APHASIA_CORRECTION_PROMPT_TEMPLATE
    else:
        system_prompt    = _SYSTEM_PROMPT
        user_template    = _CORRECTION_PROMPT_TEMPLATE

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": user_template.format(raw_text=raw_text),
                },
            ],
            temperature=0.15,
            max_tokens=500,
        )

        cleaned = _strip_wrapping_quotes(response.choices[0].message.content.strip())

        if not cleaned:
            return raw_text

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
