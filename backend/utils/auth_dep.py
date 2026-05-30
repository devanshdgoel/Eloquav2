import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth as firebase_auth
from firebase_admin.exceptions import FirebaseError

# Firebase is initialised once at startup in main.py via initialize_firebase().
# No initialisation call is needed here.
_security = HTTPBearer()
logger = logging.getLogger(__name__)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> dict:
    """
    FastAPI dependency that validates a Firebase ID token.

    Returns decoded token payload (uid, email, claims) on success.
    Raises 401 for expired/malformed tokens, 403 for revoked tokens.
    """
    token = credentials.credentials
    try:
        return firebase_auth.verify_id_token(token, check_revoked=True)
    except firebase_auth.RevokedIdTokenError:
        logger.warning("Revoked token presented")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token has been revoked. Please sign in again.",
        )
    except firebase_auth.ExpiredIdTokenError:
        logger.info("Expired token presented")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired. Please refresh and retry.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )
    except (firebase_auth.InvalidIdTokenError, FirebaseError, Exception) as exc:
        logger.warning("Token validation failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
