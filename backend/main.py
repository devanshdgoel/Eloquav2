import asyncio
import logging
from contextlib import asynccontextmanager

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
from utils.file_handler import cleanup_old_files

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

initialize_firebase()


async def _periodic_cleanup():
    """
    Delete stale temp audio files every 15 minutes regardless of which routes are active.
    Previously cleanup_old_files() was only called inside /process-audio, so workloads
    that only hit /transcribe-chunk (the common real-time recording path) never triggered
    cleanup — files accumulated for their full TTL before any sweep ran.
    """
    while True:
        # Sleep first so we don't run immediately on a fresh deploy before any files exist.
        await asyncio.sleep(15 * 60)
        try:
            deleted = cleanup_old_files()
            if deleted:
                logger.info("Scheduled cleanup removed %d file(s)", deleted)
        except Exception as exc:
            logger.warning("Scheduled cleanup failed (non-fatal): %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background cleanup loop. asyncio.create_task schedules it on the
    # running event loop; it runs concurrently with requests and never blocks them.
    cleanup_task = asyncio.create_task(_periodic_cleanup())
    yield
    cleanup_task.cancel()


app = FastAPI(title="Eloqua Backend", lifespan=lifespan)

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


@app.get("/api/wake")
def wake():
    # Pre-warm endpoint — mobile app calls this before opening Smart Speech
    # so the Render server is already awake by the time the user taps record.
    return {"status": "ok"}


app.include_router(speech_router,     prefix="/api")
app.include_router(audio_router,      prefix="/api")
app.include_router(voice_router,      prefix="/api")
app.include_router(analysis_router,   prefix="/api")
app.include_router(assessment_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
