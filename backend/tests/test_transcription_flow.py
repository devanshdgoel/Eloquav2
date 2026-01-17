from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_transcription_success(mocker):
    # Mock the Whisper transcription function
    mocker.patch(
        "services.speech_service.transcribe_audio",
        return_value="mock transcript"
    )

    with open("test.wav", "rb") as audio:
        response = client.post(
            "/api/process-audio",
            files={"file": ("test.wav", audio, "audio/wav")}
        )

    assert response.status_code == 200
    assert response.json()["transcript"] == "mock transcript"


def test_transcription_failure(mocker):
    # Mock Whisper to raise an error
    mocker.patch(
        "services.speech_service.transcribe_audio",
        side_effect=Exception("Whisper failure")
    )

    with open("test.wav", "rb") as audio:
        response = client.post(
            "/api/process-audio",
            files={"file": ("test.wav", audio, "audio/wav")}
        )

    assert response.status_code == 500
