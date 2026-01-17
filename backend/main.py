from fastapi import FastAPI
from api.speech_routes import router as speech_router

app = FastAPI(title="Eloqua Backend")

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Eloqua backend running"}

app.include_router(speech_router, prefix="/api")
