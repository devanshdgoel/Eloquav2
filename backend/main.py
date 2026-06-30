import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import ALLOWED_ORIGINS
from firebase_config import initialize_firebase
from api.analysis_routes import router as analysis_router
from api.assessment_routes import router as assessment_router
from api.audio_routes import router as audio_router
from api.speech_routes import router as speech_router
from api.voice_routes import router as voice_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

initialize_firebase()

app = FastAPI(title="Eloqua Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "An unexpected error occurred. Please try again."},
    )


@app.get("/")
def root():
    return {"status": "ok", "message": "Eloqua backend running"}


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Eloqua backend running"}


app.include_router(speech_router,     prefix="/api")
app.include_router(audio_router,      prefix="/api")
app.include_router(voice_router,      prefix="/api")
app.include_router(analysis_router,   prefix="/api")
app.include_router(assessment_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
