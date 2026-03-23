from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models
import os
import shutil
import whisper
from dotenv import load_dotenv

load_dotenv()

# Create database tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# Load the local Whisper model (we use 'base' for a good balance of speed and accuracy during development)
whisper_model = whisper.load_model("base")

@app.get("/")
def root():
    return {"message": "Backend OK, database connected!"}

@app.get("/users/")
def read_users(db: Session = Depends(get_db)):
    # This is an example of querying the database
    users = db.query(models.User).all()
    return users

@app.post("/api/v1/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Upload an audio file and transcribe it using OpenAI Whisper.
    """
    # Check if file has a valid audio extension
    valid_extensions = ('.wav', '.mp3', '.m4a', '.webm', '.ogg', '.flac')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid audio file format")
    
    # Save the uploaded file temporarily
    temp_file_path = f"temp_{file.filename}"
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Send the audio file to local open-source Whisper model (fp16=False to avoid CPU warnings)
        result = whisper_model.transcribe(temp_file_path, fp16=False)
        return {"transcript": result["text"]}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)