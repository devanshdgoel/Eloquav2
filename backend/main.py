import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from firebase_config import initialize_firebase
from api.audio_routes import router as audio_router
from api.speech_routes import router as speech_router
from api.voice_routes import router as voice_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

initialize_firebase()

app = FastAPI(title="Eloqua Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Eloqua backend running"}


app.include_router(speech_router, prefix="/api")
app.include_router(audio_router, prefix="/api")
app.include_router(voice_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
