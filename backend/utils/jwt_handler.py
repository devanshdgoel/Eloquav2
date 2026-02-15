import jwt
from datetime import datetime, timedelta, timezone

from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS


def create_access_token(user_data: dict) -> str:
    """Create a JWT access token for the given user data."""
    payload = {
        **user_data,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> dict:
    """Verify and decode a JWT access token. Raises jwt.InvalidTokenError on failure."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
