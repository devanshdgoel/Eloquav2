"""
Quick verification that Firebase Storage is wired up correctly.
Run from the backend/ directory:  python verify_storage.py
"""
import sys

try:
    from firebase_config import initialize_firebase
    initialize_firebase()
    print("✓ Firebase Admin initialised")
except Exception as e:
    print(f"✗ Firebase init failed: {e}")
    sys.exit(1)

try:
    from firebase_admin import storage
    bucket = storage.bucket()
    print(f"✓ Storage bucket accessible: {bucket.name}")
except Exception as e:
    print(f"✗ Storage bucket error: {e}")
    sys.exit(1)

try:
    # List blobs in voice_samples/ (will be empty — just tests read access)
    blobs = list(bucket.list_blobs(prefix="voice_samples/", max_results=1))
    print(f"✓ Storage read access confirmed (found {len(blobs)} existing sample(s))")
except Exception as e:
    print(f"✗ Storage read failed: {e}")
    print("  → Check the service account has 'Storage Admin' role in Google Cloud IAM")
    sys.exit(1)

print("\nAll checks passed — Firebase Storage is ready.")
