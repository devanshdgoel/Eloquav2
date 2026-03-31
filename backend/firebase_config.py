import json
import os

import firebase_admin
from firebase_admin import credentials


def initialize_firebase():
    """Initialize Firebase Admin SDK (idempotent — safe to call multiple times)."""
    if firebase_admin._apps:
        return

    # Production (Railway): set FIREBASE_SERVICE_ACCOUNT_JSON env var to the full JSON string.
    # Local dev: falls back to the firebase-service-account.json file in this directory.
    json_str = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    if json_str:
        cred = credentials.Certificate(json.loads(json_str))
    else:
        json_path = os.path.join(os.path.dirname(__file__), 'firebase-service-account.json')
        cred = credentials.Certificate(json_path)

    firebase_admin.initialize_app(cred)
