"""
Per-user vocabulary and example storage for personalized transcription and enhancement.

Two mechanisms that improve quality the more a user speaks:

1. WHISPER VOCABULARY SEEDING
   After each session, key terms (proper nouns, specific/medical vocabulary) are
   extracted from the cleaned transcript and stored per-user in Firestore.
   Future Whisper calls receive these words as a prompt prefix, biasing the
   decoder toward the user's specific vocabulary — dramatically improving
   recognition of names, medication names, and idiosyncratic terms.

2. GPT FEW-SHOT EXAMPLES
   The last 5 (raw → enhanced) transcript pairs are stored per-user.
   These are included as few-shot examples in GPT clarity prompts, teaching
   the model the specific correction patterns for this user's speech:
   their filler words, palilalia patterns, and vocabulary.
"""
import logging
import re
import time

logger = logging.getLogger(__name__)

# ── Vocabulary extraction ─────────────────────────────────────────────────────

# Words that are long but too generic to be useful vocabulary hints.
_STOPWORDS = {
    "something", "anything", "everything", "somewhere", "anywhere",
    "yesterday", "tomorrow", "afternoon", "sometimes", "everybody",
    "somebody", "yourself", "together", "different", "important",
    "wonderful", "beautiful", "excellent", "probably", "actually",
    "normally", "basically", "certainly", "generally", "recently",
    "definitely", "perfectly", "unfortunately", "comfortable",
    "appointment", "absolutely", "obviously", "literally",
    "seriously", "certainly", "apparently", "especially",
}


def extract_key_terms(text: str) -> list[str]:
    """
    Extract vocabulary terms that help Whisper recognize this user's speech.

    Targets two categories:
    - Proper nouns (capitalised mid-sentence): names, places, medications like 'Metformin'
    - Long specific terms (>= 8 chars): domain-specific words Whisper often mishears

    Returns up to 20 terms per transcript.
    """
    if not text or len(text) < 10:
        return []

    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return []

    # Build a set of words that appear sentence-initially — these are capitalised
    # only because of grammar, not because they're proper nouns.
    sentence_starters = set()
    for sentence in re.split(r"[.!?]+\s*", text):
        m = re.search(r"\b([A-Za-z]+)\b", sentence.strip())
        if m:
            sentence_starters.add(m.group(1))

    found: list[str] = []
    seen: set[str] = set()

    for word in words:
        clean = word.strip("'")
        lower = clean.lower()
        if lower in seen or len(clean) < 4:
            continue

        # Capitalised mid-sentence → probable proper noun (name, place, medication)
        if (clean[0].isupper()
                and not clean.isupper()          # exclude ALL-CAPS acronyms
                and clean not in sentence_starters
                and len(clean) >= 4):
            found.append(clean)
            seen.add(lower)

        # Long lowercase words that aren't generic stopwords
        elif (len(clean) >= 8
              and clean[0].islower()
              and lower not in _STOPWORDS):
            found.append(clean)
            seen.add(lower)

        if len(found) >= 20:
            break

    return found


def format_vocabulary_hint(words: list[str]) -> str:
    """
    Format vocabulary words as a Whisper prompt prefix.

    Whisper uses the prompt as a decoder prefix — words that appear here are
    favoured when audio is acoustically ambiguous.  Bracketed format signals
    to the model that this is metadata, not speech content.
    """
    if not words:
        return ""
    return f"[Vocabulary: {', '.join(words[:30])}]"


# ── In-memory cache for vocabulary reads ─────────────────────────────────────
# A Firestore read per chunk would add unnecessary latency.
# Cache the vocabulary for each user for 5 minutes (one recording session).

_vocab_cache: dict[str, tuple[list[str], float]] = {}
_VOCAB_CACHE_TTL = 300  # seconds


def _get_db():
    """Return the Firestore client, imported lazily to avoid startup errors."""
    from firebase_admin import firestore
    return firestore.client()


def get_user_vocabulary(uid: str) -> list[str]:
    """Fetch stored vocabulary words from Firestore. Returns [] on any error."""
    try:
        doc = _get_db().collection("user_vocabulary").document(uid).get()
        if doc.exists:
            return doc.to_dict().get("words", [])
    except Exception as exc:
        logger.warning("Failed to fetch user vocabulary for %s: %s", uid[:8], exc)
    return []


def get_user_vocabulary_cached(uid: str) -> list[str]:
    """
    Cached wrapper — reads Firestore at most once per VOCAB_CACHE_TTL seconds.
    Use this in hot paths (per-chunk transcription) to avoid per-request Firestore reads.
    """
    now = time.time()
    if uid in _vocab_cache:
        words, expires_at = _vocab_cache[uid]
        if now < expires_at:
            return words

    words = get_user_vocabulary(uid)
    _vocab_cache[uid] = (words, now + _VOCAB_CACHE_TTL)
    return words


def update_user_vocabulary(uid: str, new_terms: list[str]) -> None:
    """
    Merge new_terms into the user's stored vocabulary and cap at 60 words.

    New terms are prepended so the most recently seen words survive when the
    list is trimmed — keeping the vocabulary relevant to current usage.
    Non-blocking: errors are swallowed so callers are never interrupted.
    """
    if not new_terms:
        return
    try:
        db = _get_db()
        ref = db.collection("user_vocabulary").document(uid)
        doc = ref.get()
        existing = doc.to_dict().get("words", []) if doc.exists else []

        # Deduplicate while preserving order: new terms first
        merged = list(dict.fromkeys([t.lower() for t in new_terms] + [w.lower() for w in existing]))
        # Re-capitalise: keep the original casing from the new terms for proper nouns
        casing_map = {t.lower(): t for t in (existing + new_terms)}
        merged_cased = [casing_map.get(w, w) for w in merged[:60]]

        ref.set({"words": merged_cased}, merge=True)

        # Invalidate cache so the next read sees the updated list
        _vocab_cache.pop(uid, None)
    except Exception as exc:
        logger.warning("Failed to update user vocabulary for %s: %s", uid[:8], exc)


# ── Few-shot example storage ──────────────────────────────────────────────────

_MAX_EXAMPLES = 5  # how many (raw → enhanced) pairs to store per user


def get_user_examples(uid: str) -> list[dict]:
    """
    Fetch the stored (raw, enhanced) transcript pairs for a user.
    Returns up to _MAX_EXAMPLES most recent pairs, or [] on any error.
    """
    try:
        doc = _get_db().collection("user_transcripts").document(uid).get()
        if doc.exists:
            return doc.to_dict().get("examples", [])
    except Exception as exc:
        logger.warning("Failed to fetch user examples for %s: %s", uid[:8], exc)
    return []


def store_user_example(uid: str, raw: str, enhanced: str) -> None:
    """
    Store a (raw, enhanced) transcript pair for future few-shot use.

    Keeps the most recent _MAX_EXAMPLES pairs. Truncates transcripts to 500 chars
    each so the document stays well within Firestore's 1 MB limit.
    Non-blocking: errors are swallowed.
    """
    # Skip very short transcripts — they're not useful as examples
    if not raw or not enhanced or len(raw.strip()) < 30:
        return
    try:
        new_example = {
            "raw":      raw.strip()[:500],
            "enhanced": enhanced.strip()[:500],
        }
        db = _get_db()
        ref = db.collection("user_transcripts").document(uid)
        doc = ref.get()
        existing = doc.to_dict().get("examples", []) if doc.exists else []

        # Prepend new example, keep the most recent _MAX_EXAMPLES
        updated = [new_example] + existing
        updated = updated[:_MAX_EXAMPLES]
        ref.set({"examples": updated}, merge=True)
    except Exception as exc:
        logger.warning("Failed to store user example for %s: %s", uid[:8], exc)


def format_examples_block(examples: list[dict]) -> str:
    """
    Format stored examples as a few-shot block to prepend to GPT clarity prompts.

    Example output:
        EXAMPLES FROM THIS USER'S PREVIOUS SESSIONS — ...
        Session example 1:
          Raw:     "um I need to call my my doctor"
          Cleaned: "I need to call my doctor"
        ...
    """
    if not examples:
        return ""

    lines = [
        "EXAMPLES FROM THIS USER'S PREVIOUS SESSIONS — these show the correction patterns",
        "specific to this speaker. Use them to learn their speech style: filler words,",
        "palilalia patterns, and vocabulary. Do NOT copy from these examples; only use",
        "them to understand this speaker's patterns.\n",
    ]
    for i, ex in enumerate(examples, 1):
        lines.append(f"Session example {i}:")
        lines.append(f'  Raw:     "{ex.get("raw", "")}"')
        lines.append(f'  Cleaned: "{ex.get("enhanced", "")}"')
        lines.append("")

    return "\n".join(lines)
