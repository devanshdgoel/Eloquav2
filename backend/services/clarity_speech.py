import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

ENABLE_CLARITY = True
MAXLENGTH_EXPANSION_RATIO = 1.3


def clarity_transcript(raw_text: str) -> str:
    if not raw_text or len(raw_text.strip()) < 3:
        return raw_text

    if not ENABLE_CLARITY or not OPENAI_API_KEY:
        return raw_text

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)

        prompt = f"""
You are an assistive AI for people with speech impairments.

Improve CLARITY ONLY. Do NOT change meaning.

INPUT:
"{raw_text}"

Remove:
- duplicate adjacent words
- filler words
Fix:
- grammar
- punctuation

Do NOT:
- add content
- complete thoughts
- infer meaning

Return only cleaned text.
""".strip()

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are careful and literal."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=300
        )

        cleaned = response.choices[0].message.content.strip()

        if not cleaned:
            return raw_text

        if len(cleaned) > len(raw_text) * MAXLENGTH_EXPANSION_RATIO:
            return raw_text

        return cleaned

    except Exception:
        return raw_text
