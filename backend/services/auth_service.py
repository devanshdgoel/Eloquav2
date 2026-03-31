import hashlib
import hmac
import os
import secrets
import sqlite3

import requests

from database import get_connection

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo"

# PBKDF2 iterations — OWASP minimum for SHA-256 is 210,000
_PBKDF2_ITERATIONS = 260_000


class AuthenticationError(Exception):
    def __init__(self, error_type: str, message: str):
        self.error_type = error_type
        self.message = message
        super().__init__(message)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Return (hex_hash, hex_salt). Generates a random salt if not supplied."""
    if salt is None:
        salt = secrets.token_hex(32)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        _PBKDF2_ITERATIONS,
    )
    return key.hex(), salt


def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    computed, _ = _hash_password(password, salt)
    return hmac.compare_digest(computed, stored_hash)


# ---------------------------------------------------------------------------
# Email / password auth
# ---------------------------------------------------------------------------

def register_user(email: str, password: str, name: str = '') -> dict:
    """
    Create a new user with an email + password.
    Raises AuthenticationError if the email is already registered.
    """
    email = email.lower().strip()
    password_hash, salt = _hash_password(password)

    try:
        with get_connection() as conn:
            conn.execute(
                'INSERT INTO users (email, password_hash, salt, name) VALUES (?, ?, ?, ?)',
                (email, password_hash, salt, name),
            )
            conn.commit()
            row = conn.execute(
                'SELECT id, email, name, picture FROM users WHERE email = ?', (email,)
            ).fetchone()
            return dict(row)
    except sqlite3.IntegrityError:
        raise AuthenticationError(
            error_type='conflict',
            message='An account with this email already exists.',
        )


def login_user(email: str, password: str) -> dict:
    """
    Verify email + password and return user info.
    Raises AuthenticationError on bad credentials.
    """
    email = email.lower().strip()
    with get_connection() as conn:
        row = conn.execute(
            'SELECT id, email, name, picture, password_hash, salt FROM users WHERE email = ?',
            (email,),
        ).fetchone()

    # Same error message for unknown email and wrong password — prevents enumeration
    if not row or not row['password_hash']:
        raise AuthenticationError(error_type='invalid', message='Invalid email or password.')

    if not _verify_password(password, row['password_hash'], row['salt']):
        raise AuthenticationError(error_type='invalid', message='Invalid email or password.')

    return {'id': row['id'], 'email': row['email'], 'name': row['name'], 'picture': row['picture']}


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------

def verify_google_token(id_token: str) -> dict:
    """
    Verify a Google ID token by calling Google's tokeninfo endpoint.
    Returns user info (email, name, sub) on success.
    """
    if not id_token:
        raise AuthenticationError(error_type='invalid', message='No ID token provided')

    try:
        response = requests.get(
            GOOGLE_CERTS_URL,
            params={'id_token': id_token},
            timeout=10,
        )
    except requests.exceptions.RequestException as e:
        raise AuthenticationError(error_type='network', message=f'Could not verify token: {e}')

    if response.status_code != 200:
        raise AuthenticationError(error_type='invalid', message='Invalid or expired Google token')

    token_info = response.json()
    if 'email' not in token_info:
        raise AuthenticationError(error_type='invalid', message='Token does not contain email')

    return {
        'google_id': token_info.get('sub'),
        'email': token_info.get('email'),
        'name': token_info.get('name', ''),
        'picture': token_info.get('picture', ''),
    }


def upsert_google_user(google_info: dict) -> tuple[dict, bool]:
    """
    Insert or update a user record for a Google sign-in.
    Returns (user_dict, is_existing_user).
    """
    email = google_info['email'].lower().strip()
    with get_connection() as conn:
        row = conn.execute(
            'SELECT id, email, name, picture FROM users WHERE email = ?', (email,)
        ).fetchone()

        if row:
            # Update Google fields in case they changed
            conn.execute(
                'UPDATE users SET google_id = ?, name = ?, picture = ? WHERE email = ?',
                (google_info['google_id'], google_info['name'], google_info['picture'], email),
            )
            conn.commit()
            return dict(row), True
        else:
            conn.execute(
                'INSERT INTO users (email, google_id, name, picture) VALUES (?, ?, ?, ?)',
                (email, google_info['google_id'], google_info['name'], google_info['picture']),
            )
            conn.commit()
            new_row = conn.execute(
                'SELECT id, email, name, picture FROM users WHERE email = ?', (email,)
            ).fetchone()
            return dict(new_row), False
