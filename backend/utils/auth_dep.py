from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth as firebase_auth

# Firebase is initialised once at startup in main.py via initialize_firebase().
# No initialisation call is needed here.
_security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> dict:
    """
    FastAPI dependency that validates a Firebase ID token.

    Extracts the Bearer token from the Authorization header, verifies it
    against Firebase Auth, and returns the decoded token payload (which
    includes uid, email, and other claims).

    Raises HTTP 401 if the token is missing, malformed, or expired.
    """
    try:
        return firebase_auth.verify_id_token(credentials.credentials)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )
