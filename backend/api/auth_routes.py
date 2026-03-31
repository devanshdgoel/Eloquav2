from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from services.auth_service import (
    AuthenticationError,
    login_user,
    register_user,
    upsert_google_user,
    verify_google_token,
)
from utils.jwt_handler import create_access_token
from utils.responses import success_response

router = APIRouter()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class EmailAuthRequest(BaseModel):
    email: str
    password: str

    @field_validator('password')
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters.')
        return v


class RegisterRequest(EmailAuthRequest):
    name: str = ''


class GoogleAuthRequest(BaseModel):
    id_token: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _token_response(user: dict, is_existing_user: bool):
    access_token = create_access_token({
        'user_id': user.get('id'),
        'email': user['email'],
        'name': user.get('name', ''),
    })
    return success_response({
        'access_token': access_token,
        'user': {
            'email': user['email'],
            'name': user.get('name', ''),
            'picture': user.get('picture', ''),
        },
        'is_existing_user': is_existing_user,
    })


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post('/auth/register')
async def register(request: RegisterRequest):
    """Create a new account with email + password."""
    try:
        user = register_user(request.email, request.password, request.name)
    except AuthenticationError as e:
        status = 409 if e.error_type == 'conflict' else 400
        raise HTTPException(status_code=status, detail=e.message)
    return _token_response(user, is_existing_user=False)


@router.post('/auth/login')
async def login(request: EmailAuthRequest):
    """Sign in with email + password."""
    try:
        user = login_user(request.email, request.password)
    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=e.message)
    return _token_response(user, is_existing_user=True)


@router.post('/auth/google')
async def google_auth(request: GoogleAuthRequest):
    """Sign in / register via Google OAuth ID token."""
    try:
        google_info = verify_google_token(request.id_token)
    except AuthenticationError as e:
        status = 503 if e.error_type == 'network' else 401
        raise HTTPException(status_code=status, detail=e.message)

    user, is_existing = upsert_google_user(google_info)
    return _token_response(user, is_existing_user=is_existing)
