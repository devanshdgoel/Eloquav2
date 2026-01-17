from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_valid_audio_upload():
    with open("test.wav", "rb") as audio:
        response = client.post(
            "/api/process-audio",
            files={"file": ("test.wav", audio, "audio/wav")}
        )

    assert response.status_code == 200
    assert response.json()["status"] == "transcribed"

def test_invalid_audio_upload():
    response = client.post(
        "/api/process-audio",
        files={"file": ("test.txt", b"not audio", "text/plain")}
    )

    assert response.status_code == 400
