import os
import shutil
import uuid
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from pydantic import BaseModel
import google.generativeai as genai

import models
from database import get_db
from auth import get_current_user
from ml_models import whisper_model

router = APIRouter()

# Setup GenAI config safely if possible here or expect it in route
# It's better to configure it inside the route if API key might change, or just once if it's static.
def get_gemini_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API key is missing.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel('gemini-2.5-flash')


class QuestionResponse(BaseModel):
    id: int
    part: str
    topic: Optional[str]
    question_text: str

@router.get("/questions/generate", response_model=QuestionResponse)
def generate_question(part: str, db: Session = Depends(get_db)):
    """
    Generate a random IELTS question for part1, part2, or part3 using Gemini AI.
    """
    if part not in ["part1", "part2", "part3"]:
        raise HTTPException(status_code=400, detail="part must be 'part1', 'part2', or 'part3'")
        
    model = get_gemini_model()
    
    prompts = {
        "part1": "Generate a single random IELTS Speaking Part 1 question. It should be a short, conversational question about familiar topics like home, work, study, hobbies, etc. Only return the question text, no introductions.",
        "part2": "Generate a random IELTS Speaking Part 2 cue card question. It should start with 'Describe a...' and include 3-4 bullet points of what to say. Only return the actual cue card text.",
        "part3": "Generate a single random IELTS Speaking Part 3 question. It should be an abstract, analytical question related to broader themes in society. Only return the question text."
    }
    
    try:
        response = model.generate_content(prompts[part])
        question_text = response.text.strip()
        
        # Save to DB
        new_question = models.Question(
            part=part,
            topic="AI Generated",
            question_text=question_text
        )
        db.add(new_question)
        db.commit()
        db.refresh(new_question)
        
        return new_question
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate question: {str(e)}")


@router.post("/submissions", status_code=status.HTTP_201_CREATED)
async def create_submission(
    file: UploadFile = File(...),
    question_id: Optional[int] = Form(None),
    question_text: Optional[str] = Form(None),
    part: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Submit an audio response to a question. 
    Can pass an existing `question_id`, OR `question_text` and `part` to create a new custom question inline.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can submit answers.")
        
    # 1. Resolve Question
    if question_id:
        question = db.query(models.Question).filter(models.Question.id == question_id).first()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found.")
    elif question_text and part:
        if part not in ["part1", "part2", "part3"]:
            raise HTTPException(status_code=400, detail="Invalid part.")
        # Create new question from user input
        question = models.Question(
            part=part,
            topic="User Custom",
            question_text=question_text
        )
        db.add(question)
        db.commit()
        db.refresh(question)
    else:
        raise HTTPException(status_code=400, detail="Must provide either question_id, or question_text and part.")

    # 2. Save Audio File
    valid_extensions = ('.wav', '.mp3', '.m4a', '.webm', '.ogg', '.flac')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid audio file format")
        
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join("uploads", filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 3. Create Submission record
    submission = models.Submission(
        user_id=current_user.id,
        question_id=question.id,
        audio_file_path=filepath,
        status="pending"
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    
    try:
        # 4. Transcribe Audio
        result = whisper_model.transcribe(filepath, fp16=False)
        transcript_text = result["text"]
        
        submission.transcript = transcript_text
        submission.status = "transcribed"
        db.commit()
        
        # 5. Evaluate with AI
        model = get_gemini_model()
        prompt = f"""You are a certified IELTS Speaking examiner. Be strict, objective, and consistent with official IELTS band descriptors.

Evaluate the candidate's response to the following question.

Question ({question.part}): "{question.question_text}"

Candidate's Response:
"{transcript_text}"

Scoring criteria:
- Fluency and Coherence
- Lexical Resource
- Grammatical Range and Accuracy
- Pronunciation (estimate based on text only)

Instructions:
- Give realistic band scores (0-9, allow .5 like 6.5)
- Do NOT be overly generous
- Base feedback on specific issues in the response in context of addressing the question.
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
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        evaluation_result = json.loads(response.text)
        
        # 6. Save Evaluation
        ai_eval = models.AiEvaluation(
            submission_id=submission.id,
            fluency_score=evaluation_result["fluency_coherence"]["score"],
            lexical_score=evaluation_result["lexical_resource"]["score"],
            grammar_score=evaluation_result["grammar"]["score"],
            overall_score=evaluation_result["overall_band"],
            strengths=json.dumps({"fluency": evaluation_result["fluency_coherence"]["strengths"], "lexical": evaluation_result["lexical_resource"]["strengths"], "grammar": evaluation_result["grammar"]["strengths"]}),
            areas_for_improvement=json.dumps({"key_mistakes": evaluation_result["key_mistakes"], "suggestions": evaluation_result["improvement_suggestions"]}),
            raw_llm_response=evaluation_result
        )
        db.add(ai_eval)
        submission.status = "ai_evaluated"
        db.commit()
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Even if AI evaluation fails, we keep the submission so they can process it later or manual review
        raise HTTPException(status_code=500, detail=f"Audio processed but evaluation failed: {str(e)}")

    return {"message": "Submission successful and evaluated", "submission_id": submission.id}


@router.get("/submissions")
def get_submissions(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    List submissions based on user role.
    Students see only theirs. Teachers/admins see all.
    """
    query = db.query(models.Submission).options(
        joinedload(models.Submission.question),
        joinedload(models.Submission.ai_evaluation),
        joinedload(models.Submission.teacher_review)
    )
    
    if current_user.role == "student":
        query = query.filter(models.Submission.user_id == current_user.id)
        
    submissions = query.order_by(models.Submission.submitted_at.desc()).all()
    
    results = []
    for sub in submissions:
        ai_score = sub.ai_evaluation.overall_score if sub.ai_evaluation else None
        teacher_score = sub.teacher_review.final_overall_score if sub.teacher_review else None
        overall_score = teacher_score if teacher_score is not None else ai_score
        
        results.append({
            "id": sub.id,
            "question": sub.question.question_text if sub.question else None,
            "part": sub.question.part if sub.question else None,
            "status": sub.status,
            "submitted_at": sub.submitted_at,
            "score": overall_score,
            "ai_overall_score": ai_score,
            "teacher_overall_score": teacher_score,
            "audio_file_path": f"/{sub.audio_file_path}"
        })
        
    return results


@router.get("/submissions/{submission_id}")
def get_submission_detail(submission_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Get the full details of a specific submission.
    """
    submission = db.query(models.Submission).options(
        joinedload(models.Submission.question),
        joinedload(models.Submission.ai_evaluation),
        joinedload(models.Submission.user)
    ).filter(models.Submission.id == submission_id).first()
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    if current_user.role == "student" and submission.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this submission")
        
    return {
        "id": submission.id,
        "student_name": submission.user.full_name,
        "question": {
            "part": submission.question.part,
            "text": submission.question.question_text
        },
        "audio_url": f"/{submission.audio_file_path}",
        "transcript": submission.transcript,
        "status": submission.status,
        "submitted_at": submission.submitted_at,
        "ai_evaluation": submission.ai_evaluation.raw_llm_response if submission.ai_evaluation else None
    }
