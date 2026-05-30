import json
import logging
import os

import firebase_admin
from firebase_admin import credentials

logger = logging.getLogger(__name__)


def initialize_firebase():
    """Initialize Firebase Admin SDK (idempotent — safe to call multiple times)."""
    if firebase_admin._apps:
        return

    # Production: set FIREBASE_SERVICE_ACCOUNT_JSON env var to the full JSON string.
    # Local dev: falls back to the firebase-service-account.json file in this directory.
    try:
        json_str = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
        if json_str:
            cred = credentials.Certificate(json.loads(json_str))
        else:
            json_path = os.path.join(os.path.dirname(__file__), 'firebase-service-account.json')
            if not os.path.exists(json_path):
                raise FileNotFoundError(
                    f"Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT_JSON env var "
                    f"or place firebase-service-account.json at {json_path}"
                )
            cred = credentials.Certificate(json_path)

        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialised successfully")

    except Exception as exc:
        logger.critical("Failed to initialise Firebase Admin SDK: %s", exc)
        raise RuntimeError(f"Firebase init failed — backend cannot start: {exc}") from exc
