import os
from dotenv import load_dotenv

load_dotenv()

# Required — app will fail to start if missing
JWT_SECRET = os.environ.get("JWT_SECRET", "eloqua-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))

# External API keys (optional — features degrade gracefully)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8081,http://localhost:19006").split(",")

# Audio processing
MAX_AUDIO_SIZE_MB = int(os.getenv("MAX_AUDIO_SIZE_MB", "25"))
TEMP_AUDIO_MAX_AGE_MINUTES = int(os.getenv("TEMP_AUDIO_MAX_AGE_MINUTES", "60"))
