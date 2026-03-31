import os
from dotenv import load_dotenv

load_dotenv()

# External API keys (optional — features degrade gracefully)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

# CORS
# Default "*" allows any origin during local development.
# In production, set ALLOWED_ORIGINS=https://your-domain.com in .env
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = _raw_origins.split(",") if _raw_origins != "*" else ["*"]

# Audio processing
MAX_AUDIO_SIZE_MB = int(os.getenv("MAX_AUDIO_SIZE_MB", "25"))
TEMP_AUDIO_MAX_AGE_MINUTES = int(os.getenv("TEMP_AUDIO_MAX_AGE_MINUTES", "60"))
