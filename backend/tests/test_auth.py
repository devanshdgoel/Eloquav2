"""
Tests for email/password auth, JWT, and Google OAuth upsert.
Uses an in-memory SQLite DB so no test.db file is created.
"""
import sys
import os
import sqlite3
import pytest

# Make the backend root importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Patch database to use in-memory SQLite before any imports ────────────────
import database as _db_module

_in_memory_conn = sqlite3.connect(':memory:', check_same_thread=False)
_in_memory_conn.row_factory = sqlite3.Row


def _get_in_memory_connection():
    return _in_memory_conn


_db_module.get_connection = _get_in_memory_connection
_db_module.init_db()

# Now import the service (it will use the patched get_connection)
from services.auth_service import (
    register_user,
    login_user,
    upsert_google_user,
    AuthenticationError,
)
from utils.jwt_handler import create_access_token, verify_access_token


# ── Helpers ──────────────────────────────────────────────────────────────────

def _clear_users():
    _in_memory_conn.execute('DELETE FROM users')
    _in_memory_conn.commit()


# ── register_user ─────────────────────────────────────────────────────────────

class TestRegisterUser:
    def setup_method(self):
        _clear_users()

    def test_creates_user_and_returns_dict(self):
        user = register_user('alice@example.com', 'password123', 'Alice')
        assert user['email'] == 'alice@example.com'
        assert user['name'] == 'Alice'
        assert 'id' in user

    def test_email_is_lowercased(self):
        user = register_user('BOB@EXAMPLE.COM', 'password123')
        assert user['email'] == 'bob@example.com'

    def test_duplicate_email_raises_conflict(self):
        register_user('carol@example.com', 'pass1')
        with pytest.raises(AuthenticationError) as exc:
            register_user('carol@example.com', 'pass2')
        assert exc.value.error_type == 'conflict'

    def test_duplicate_email_case_insensitive(self):
        register_user('dave@example.com', 'pass1')
        with pytest.raises(AuthenticationError):
            register_user('DAVE@example.com', 'pass2')


# ── login_user ────────────────────────────────────────────────────────────────

class TestLoginUser:
    def setup_method(self):
        _clear_users()
        register_user('eve@example.com', 'correct-password', 'Eve')

    def test_correct_password_returns_user(self):
        user = login_user('eve@example.com', 'correct-password')
        assert user['email'] == 'eve@example.com'
        assert user['name'] == 'Eve'

    def test_wrong_password_raises_invalid(self):
        with pytest.raises(AuthenticationError) as exc:
            login_user('eve@example.com', 'wrong-password')
        assert exc.value.error_type == 'invalid'
        assert 'Invalid' in exc.value.message

    def test_unknown_email_raises_invalid(self):
        # Same error as wrong password — prevents user enumeration
        with pytest.raises(AuthenticationError) as exc:
            login_user('nobody@example.com', 'any-password')
        assert exc.value.error_type == 'invalid'

    def test_email_login_case_insensitive(self):
        user = login_user('EVE@EXAMPLE.COM', 'correct-password')
        assert user['email'] == 'eve@example.com'


# ── JWT ───────────────────────────────────────────────────────────────────────

class TestJWT:
    def test_create_and_verify_roundtrip(self):
        token = create_access_token({'user_id': 1, 'email': 'f@example.com'})
        assert isinstance(token, str)
        decoded = verify_access_token(token)
        assert decoded['email'] == 'f@example.com'
        assert decoded['user_id'] == 1

    def test_tampered_token_raises(self):
        import jwt
        token = create_access_token({'email': 'g@example.com'})
        bad_token = token[:-4] + 'XXXX'
        with pytest.raises(jwt.InvalidTokenError):
            verify_access_token(bad_token)


# ── upsert_google_user ────────────────────────────────────────────────────────

class TestUpsertGoogleUser:
    def setup_method(self):
        _clear_users()

    _google_info = {
        'google_id': 'goog-abc-123',
        'email': 'guser@gmail.com',
        'name': 'Google User',
        'picture': 'https://example.com/pic.jpg',
    }

    def test_new_user_returns_is_existing_false(self):
        user, is_existing = upsert_google_user(self._google_info)
        assert not is_existing
        assert user['email'] == 'guser@gmail.com'

    def test_existing_user_returns_is_existing_true(self):
        upsert_google_user(self._google_info)
        _, is_existing = upsert_google_user(self._google_info)
        assert is_existing

    def test_google_and_email_user_same_email_merges(self):
        # Register via email first
        register_user('guser@gmail.com', 'somepass', 'Email User')
        # Then sign in via Google — should find existing account
        user, is_existing = upsert_google_user(self._google_info)
        assert is_existing
        assert user['email'] == 'guser@gmail.com'
