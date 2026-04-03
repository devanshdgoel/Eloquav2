from dotenv import load_dotenv
load_dotenv()


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.speech_routes import router as speech_router
from api.audio_routes import router as audio_router
from api.auth_routes import router as auth_router
from api.voice_routes import router as voice_router

app = FastAPI(title="Eloqua Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Eloqua backend running"}

app.include_router(speech_router, prefix="/api")
app.include_router(audio_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(voice_router, prefix="/api")