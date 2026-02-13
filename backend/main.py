from dotenv import load_dotenv
load_dotenv()


from fastapi import FastAPI
from api.speech_routes import router as speech_router
from api.audio_routes import router as audio_router
from api.auth_routes import router as auth_router

app = FastAPI(title="Eloqua Backend")

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Eloqua backend running"}

app.include_router(speech_router, prefix="/api")
app.include_router(audio_router, prefix="/api")
app.include_router(auth_router, prefix="/api")