from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models
import os
import shutil
import whisper
from dotenv import load_dotenv
import google.generativeai as genai # Trigger reload
from pydantic import BaseModel
import json

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

class TranscriptRequest(BaseModel):
    transcript: str

@app.post("/api/v1/evaluate_transcript")
async def evaluate_transcript(request: TranscriptRequest):
    """
    Evaluate candidate's transcript using Gemini AI.
    """
    # Configure Gemini API
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API key is missing in environment variables.")
        
    genai.configure(api_key=api_key)
    
    prompt = f"""You are a certified IELTS Speaking examiner. Be strict, objective, and consistent with official IELTS band descriptors.

Evaluate the candidate's response below.

Response:
"{request.transcript}"

Scoring criteria:
- Fluency and Coherence
- Lexical Resource
- Grammatical Range and Accuracy
- Pronunciation (estimate based on text only)

Instructions:
- Give realistic band scores (0–9, allow .5 like 6.5)
- Do NOT be overly generous
- Base feedback on specific issues in the response
- Avoid vague comments

Return ONLY valid JSON (no explanation outside JSON):

{{
  "overall_band": number,
  "fluency_coherence": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "lexical_resource": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "grammar": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "pronunciation": {{
    "score": number,
    "note": "Estimated from text",
    "feedback": string
  }},
  "key_mistakes": [
    "specific mistake 1",
    "specific mistake 2"
  ],
  "improvement_suggestions": [
    "actionable suggestion 1",
    "actionable suggestion 2",
    "actionable suggestion 3"
  ]
}}"""

    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        return json.loads(response.text)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

@app.post("/api/v1/evaluate_audio")
async def evaluate_audio(file: UploadFile = File(...)):
    """
    Upload an audio file, transcribe it using Whisper, and evaluate it using Gemini AI.
    """
    valid_extensions = ('.wav', '.mp3', '.m4a', '.webm', '.ogg', '.flac')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid audio file format")
    
    temp_file_path = f"temp_{file.filename}"
    try:
        # 1. Save uploaded file
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Transcribe Audio
        result = whisper_model.transcribe(temp_file_path, fp16=False)
        transcript_text = result["text"]
        
        # 3. Evaluate Transcript
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Gemini API key is missing.")
            
        genai.configure(api_key=api_key)
        
        prompt = f"""You are a certified IELTS Speaking examiner. Be strict, objective, and consistent with official IELTS band descriptors.

Evaluate the candidate's response below.

Response:
"{transcript_text}"

Scoring criteria:
- Fluency and Coherence
- Lexical Resource
- Grammatical Range and Accuracy
- Pronunciation (estimate based on text only)

Instructions:
- Give realistic band scores (0–9, allow .5 like 6.5)
- Do NOT be overly generous
- Base feedback on specific issues in the response
- Avoid vague comments

Return ONLY valid JSON (no explanation outside JSON):

{{
  "overall_band": number,
  "fluency_coherence": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "lexical_resource": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "grammar": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "pronunciation": {{
    "score": number,
    "note": "Estimated from text",
    "feedback": string
  }},
  "key_mistakes": [
    "specific mistake 1",
    "specific mistake 2"
  ],
  "improvement_suggestions": [
    "actionable suggestion 1",
    "actionable suggestion 2",
    "actionable suggestion 3"
  ]
}}"""

        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        evaluation_result = json.loads(response.text)
        
        return {
            "transcript": transcript_text,
            "evaluation": evaluation_result
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)