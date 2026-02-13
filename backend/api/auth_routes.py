from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.auth_service import verify_google_token, AuthenticationError
from utils.jwt_handler import create_access_token


router = APIRouter()


class GoogleAuthRequest(BaseModel):
    id_token: str


@router.post("/auth/google")
async def google_auth(request: GoogleAuthRequest):
    """
    Receive a Google ID token from the frontend,
    verify it, and return an internal JWT.
    """
    try:
        user_info = verify_google_token(request.id_token)
    except AuthenticationError as e:
        if e.error_type == "network":
            raise HTTPException(status_code=503, detail=e.message)
        raise HTTPException(status_code=401, detail=e.message)

    # Create internal JWT
    access_token = create_access_token({
        "google_id": user_info["google_id"],
        "email": user_info["email"],
        "name": user_info["name"],
    })

    return {
        "status": "success",
        "access_token": access_token,
        "user": {
            "email": user_info["email"],
            "name": user_info["name"],
            "picture": user_info["picture"],
        },
        "is_existing_user": False,  # TODO: check against DB when user storage is added
    }
