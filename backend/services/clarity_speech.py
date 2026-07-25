import logging
from openai import OpenAI

from config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

ENABLE_CLARITY = True

# Single client instance reused across all calls — avoids the ~150 ms of
# connection setup overhead that comes with instantiating OpenAI() per request.
_client: OpenAI | None = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# Output must be same length or shorter in almost all cases: we only remove
# artefacts (fillers, repetitions) and split fused words.  The 1.15 margin
# covers cases where completing a trailing fragment adds a few words.
MAX_LENGTH_EXPANSION_RATIO = 1.15

# System prompt that primes the model with the clinical context before
# the per-request user prompt is sent.
_SYSTEM_PROMPT = (
    "You are a minimal transcription artefact remover for people with Hypokinetic Dysarthria "
    "caused by Parkinson's disease. Their speech is often soft, slurred, or run together, so "
    "Whisper frequently mishears function words or merges nearby words. "
    "You remove only four things: palilalia (word repetitions), "
    "filler sounds (um/uh/ah/er/hmm), non-speech sounds, and unambiguously fused words. "
    "You may also complete or delete a clearly trailing final fragment when the rest of the "
    "transcript makes the intent obvious. "
    "You never add, infer, or change any words beyond these operations. When in doubt, return "
    "the text unchanged."
)

# ── Single-shot correction prompt (used for /process-audio full recordings) ───
_CORRECTION_PROMPT_TEMPLATE = """\
The text below is a raw Whisper transcription of speech from a person with Hypokinetic \
Dysarthria (Parkinson's disease). Remove transcription artefacts only. \
You must not add, change, or infer any words — this person's exact words must be preserved.

WHAT TO CORRECT — only these five things:

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

5. Trailing incomplete sentence — if the VERY LAST WORDS trail off mid-thought
   with no natural grammatical ending, handle it one of two ways:
   a) COMPLETE IT: only when the ending is entirely obvious from what was said
      earlier in this same transcription. Add the fewest possible words.
      "I take two pills every morning. I need to take my" → "I need to take my pills"
      "I have an appointment with Dr. Smith on Tuesday. I need to call" → "I need to call Dr. Smith"
   b) DELETE the trailing fragment: when the ending is ambiguous or would require
      guessing — even a plausible guess. Remove the fragment entirely.
      "I was going to tell you about" → delete; "I wanted to" → delete
   Do NOT apply this rule to any sentence except the very last one.
   Do NOT invent content using general knowledge — only words already in the transcript.

ABSOLUTE RULES — never break these:
- Never add any word not already in the transcription, EXCEPT when completing
  an obvious trailing fragment per rule 5a using context from the same transcript.
- Never remove content words mid-transcript. You MAY remove a trailing unfinished
  fragment at the very end (rule 5b).
- Never rephrase, restructure, or rewrite any part of the sentence.
- Never change the speaker's word choices or intended meaning.
- When in doubt about any correction, return the text exactly as received.
- Fix punctuation and capitalisation only.
- Never wrap the output in quotation marks of any kind.
{examples_block}
INPUT TRANSCRIPTION:
"{raw_text}"

Return ONLY the corrected text. If nothing needs correcting, return it exactly as above. \
No explanation, no preamble, no quotation marks."""


# ── Per-chunk correction prompt (real-time chunked pipeline) ─────────────────
# Does NOT handle trailing fragments — a chunk ending mid-sentence is normal,
# and the fragment continues in the next chunk. Trailing handling is done only
# in the final pass once the complete transcript is available.
_CHUNKED_CORRECTION_PROMPT_TEMPLATE = """\
You are removing artefacts from a real-time transcription chunk for a person with Hypokinetic \
Dysarthria (Parkinson's disease). This person's exact words must be preserved.

PREVIOUSLY CORRECTED CONTEXT — for sentence-continuity awareness only. \
Do NOT echo, repeat, or include any part of this in your response:
"{context}"

NEW CHUNK TO CORRECT:
"{raw_text}"

The chunk may start mid-sentence (continuing directly from the context) or end mid-sentence. \
That is normal — do not complete the sentence, just clean what is in this chunk.

Correct ONLY these four things:
1. Palilalia — involuntary word or phrase repetition: "I want I want to go" → "I want to go"
2. Filler sounds — um, uh, ah, er, hmm: remove them
3. Non-speech sounds — [clears throat], ahem, coughing: remove them
4. Clearly fused words — split only when completely unambiguous: "Iwant" → "I want"

ABSOLUTE RULES:
- Never add any word not already present in the chunk.
- Never remove content words (nouns, verbs, adjectives, adverbs).
- Never complete, extend, or rephrase the sentence.
- Never echo or repeat any text from the PREVIOUSLY CORRECTED CONTEXT above.
- When in doubt about any correction, return the chunk exactly as received.
- Never wrap the output in quotation marks.

IMPORTANT — SENTENCE BOUNDARY RULE:
Chunks are fixed-length recordings (4 seconds). A chunk will often end mid-sentence or mid-phrase. \
If this chunk ends mid-sentence, do NOT add terminal punctuation (no period, exclamation mark, or \
question mark) at the end. Leave it open-ended exactly as it is. Only add terminal punctuation if \
the chunk contains a clearly complete sentence that ends at a natural boundary.

Return ONLY the corrected version of the NEW CHUNK, starting exactly where the chunk starts."""


# ── Final coherence pass prompt (run once on complete accumulated transcript) ─
_FINAL_PASS_PROMPT_TEMPLATE = """\
The text below is a complete transcript recorded in 4-second chunks. Each chunk was individually \
corrected, but chunk boundaries do not align with sentence boundaries. The per-chunk processor \
sometimes added a period or capital letter mid-sentence. Your job is to fix those seam artifacts \
and clean up the complete transcript.

PERMITTED CHANGES — these four only:

1. RE-JOIN SPLIT SENTENCES (most important).
   A sentence was split if a period, exclamation mark, or question mark is followed by a word \
that grammatically continues the same sentence — for example a conjunction (and, but, or, so, \
yet, because, although, while, when, that, which, who), an article (the, a, an), a preposition \
(to, for, in, at, of, with, from, by, about, into), or any other lowercase continuation word.
   Action: remove the terminal punctuation and lowercase the first letter of the continuation \
word so the sentence flows naturally.
   Examples:
     "I went to see my. doctor yesterday" → "I went to see my doctor yesterday"
     "She called the. pharmacy and asked" → "She called the pharmacy and asked"
     "He felt much better. but was still tired" → "He felt much better but was still tired"
     "I need to. take my medication" → "I need to take my medication"

2. REMOVE VERBATIM DUPLICATIONS at chunk joins (not intentional palilalia).
   "go to the the doctor" → "go to the doctor"

3. FIX PUNCTUATION AND CAPITALISATION at genuine sentence boundaries for readability.

4. HANDLE A TRAILING INCOMPLETE FRAGMENT — applies only to the very last words of the
   transcript. If the final words are a clearly unfinished sentence with no natural ending:
   a) COMPLETE IT: only when the ending is entirely obvious from content already present
      elsewhere in this same transcript. Add the fewest possible words.
      "I take two pills in the morning. I should take my" → "I should take my pills"
      "I have an appointment with Dr. Smith. I need to call" → "I need to call Dr. Smith"
      "I went to the pharmacy and they said the medication was" → "was ready" only if "ready" appears earlier
   b) DELETE the fragment: when the ending is ambiguous, requires guessing, or would need
      content not already present in the transcript. Remove the entire unfinished fragment.
      "I was thinking about" → delete; "She told me I should" → delete (unless subject is clear)
   Do NOT apply this rule anywhere other than the final trailing words.
   Do NOT invent content — only words or names already present in the transcript may be used.
   When in doubt between completing and deleting, always delete.
{examples_block}
ABSOLUTE RULES — never break these:
- Never add any word that is not already in the text, EXCEPT when completing an
  obvious trailing fragment per rule 4a using content from the same transcript.
- Never remove content words mid-transcript. You MAY delete a trailing unfinished
  fragment at the very end (rule 4b).
- Never rephrase, restructure, or reorder any part of the text.
- Never complete or extend any sentence except the final trailing fragment.
- Only remove a period if what follows it is clearly a grammatical continuation, not a new sentence.
- If the text is already clean, return it exactly as received.
- Never wrap the output in quotation marks.

INPUT TRANSCRIPT:
"{text}"

Return ONLY the cleaned transcript. No explanation, no preamble, no quotation marks."""


# ── Final pass system prompt ──────────────────────────────────────────────────
_FINAL_PASS_SYSTEM_PROMPT = (
    "You are a transcription seam-repair assistant for clinical speech transcripts. "
    "You fix cross-chunk boundary artifacts in an already artefact-corrected transcript. "
    "Your primary job is to re-join sentences that were split across 4-second recording chunks. "
    "You may also complete or delete a clearly trailing final fragment. "
    "You never add, infer, or change any words beyond re-joining fragments and fixing "
    "punctuation/capitalisation — only remove duplications or add the fewest words needed "
    "to close an obvious trailing sentence."
)


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


def _build_examples_block(examples: list[dict] | None) -> str:
    """
    Format stored user examples as a block to insert into prompts.
    Returns an empty string (not None) when no examples are available,
    so the template {examples_block} substitution is always safe.
    """
    if not examples:
        return ""
    from services.vocabulary_service import format_examples_block
    block = format_examples_block(examples)
    # Wrap in newlines so the block integrates cleanly into the template
    return f"\n{block}\n" if block else ""


def clarity_final_pass(enhanced_text: str, examples: list[dict] | None = None) -> str:
    """
    Single coherence pass on the full accumulated enhanced transcript after recording stops.

    Removes cross-chunk seam artifacts: words duplicated at chunk joins, punctuation
    inconsistencies, and trailing incomplete fragments (completed or deleted based on
    in-transcript context).

    examples: optional (raw, enhanced) pairs from the user's previous sessions,
              included as few-shot examples to improve correction quality.

    Falls back to the unmodified input on any error — the transcript is never lost.
    """
    if not enhanced_text or len(enhanced_text.strip()) < 10:
        return enhanced_text

    if not ENABLE_CLARITY or not _client:
        return enhanced_text

    examples_block = _build_examples_block(examples)

    try:
        response = _client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _FINAL_PASS_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _FINAL_PASS_PROMPT_TEMPLATE.format(
                        text=enhanced_text,
                        examples_block=examples_block,
                    ),
                },
            ],
            temperature=0.10,
            max_tokens=1500,
        )

        cleaned = _strip_wrapping_quotes(response.choices[0].message.content.strip())

        if not cleaned:
            return enhanced_text

        # A final pass that substantially expands the transcript has added words.
        # Allow slight expansion (trailing fragment completion) but reject clear overreach.
        if len(cleaned) > len(enhanced_text) * MAX_LENGTH_EXPANSION_RATIO:
            logger.warning("Final pass output too long (added words?), discarding")
            return enhanced_text

        return cleaned

    except Exception as exc:
        logger.warning("Final clarity pass failed, returning pre-pass text: %s", exc)
        return enhanced_text


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

    if not ENABLE_CLARITY or not _client:
        return raw_text

    # Keep only the tail of the context to stay within token budget
    context_window = context[-400:] if len(context) > 400 else context

    try:
        response = _client.chat.completions.create(
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
            temperature=0.10,
            # 400 tokens handles chunks where Whisper produced a long run-on
            # sentence with several fused words to split.
            max_tokens=400,
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


def clarity_transcript(raw_text: str, examples: list[dict] | None = None) -> str:
    """
    Remove Hypokinetic Dysarthria transcription artefacts from a raw Whisper output.

    Removes: palilalia, filler sounds, non-speech sounds, unambiguously fused words.
    Also handles a clearly trailing final fragment: completes it if the continuation
    is obvious from in-transcript context, or deletes it if ambiguous.

    examples: optional (raw, enhanced) pairs from the user's previous sessions.
              Included as few-shot examples so GPT learns this user's speech patterns.

    Falls back to the raw transcription on any error.
    """
    if not raw_text or len(raw_text.strip()) < 3:
        return raw_text

    if not ENABLE_CLARITY or not _client:
        return raw_text

    examples_block = _build_examples_block(examples)

    try:
        response = _client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _CORRECTION_PROMPT_TEMPLATE.format(
                        raw_text=raw_text,
                        examples_block=examples_block,
                    ),
                },
            ],
            # Low temperature keeps corrections deterministic and literal —
            # the model must copy the text and remove artefacts, not rewrite.
            temperature=0.10,
            max_tokens=600,
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
