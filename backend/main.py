from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Eloqua backend running"}

@app.post("/process-audio")
async def process_audio(file: UploadFile = File(...)):
    return { 
        "status": "received", 
        "filename": file.filename, 
        "message": "Audio received, pipeline coming next"
    }
