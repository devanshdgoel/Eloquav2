import os
import requests


GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo"


class AuthenticationError(Exception):
    def __init__(self, error_type: str, message: str):
        self.error_type = error_type
        self.message = message
        super().__init__(message)


def verify_google_token(id_token: str) -> dict:
    """
    Verify a Google ID token by calling Google's tokeninfo endpoint.
    Returns user info (email, name, sub) on success.
    """
    if not id_token:
        raise AuthenticationError(
            error_type="invalid",
            message="No ID token provided"
        )

    try:
        response = requests.get(
            GOOGLE_CERTS_URL,
            params={"id_token": id_token},
            timeout=10
        )
    except requests.exceptions.RequestException as e:
        raise AuthenticationError(
            error_type="network",
            message=f"Could not verify token: {str(e)}"
        )

    if response.status_code != 200:
        raise AuthenticationError(
            error_type="invalid",
            message="Invalid or expired Google token"
        )

    token_info = response.json()

    # Basic validation
    if "email" not in token_info:
        raise AuthenticationError(
            error_type="invalid",
            message="Token does not contain email"
        )

    return {
        "google_id": token_info.get("sub"),
        "email": token_info.get("email"),
        "name": token_info.get("name", ""),
        "picture": token_info.get("picture", ""),
    }
