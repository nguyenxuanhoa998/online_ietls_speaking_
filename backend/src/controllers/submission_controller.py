import json
import math
import os
from typing import Optional

import cloudinary
import cloudinary.uploader
from fastapi import BackgroundTasks, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from src.models.db_models import AiEvaluation, Question, Submission, TeacherReview, User
from src.models.schemas import TeacherReviewPayload
from src.services.evaluation_service import evaluate_with_ai, generate_question_text
from src.services.transcription_service import transcribe_audio
from src.utils.database import SessionLocal

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)


def get_teachers(db: Session):
    teachers = (
        db.query(User)
        .filter(User.role == "teacher", User.is_approved == True)
        .order_by(User.full_name)
        .all()
    )
    return [{"id": t.id, "full_name": t.full_name} for t in teachers]


def generate_question(part: str, db: Session):
    if part not in ["part1", "part2", "part3"]:
        raise HTTPException(status_code=400, detail="part must be 'part1', 'part2', or 'part3'")
    try:
        question_text = generate_question_text(part)
        new_question = Question(part=part, topic="AI Generated", question_text=question_text)
        db.add(new_question)
        db.commit()
        db.refresh(new_question)
        return new_question
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate question: {str(e)}")


async def create_submission(
    background_tasks: BackgroundTasks,
    db: Session,
    current_user: User,
    file: UploadFile,
    question_id: Optional[int],
    question_text: Optional[str],
    part: Optional[str],
    teacher_id: Optional[int] = None,
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can submit answers.")

    if question_id:
        question = db.query(Question).filter(Question.id == question_id).first()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found.")
    elif question_text and part:
        if part not in ["part1", "part2", "part3"]:
            raise HTTPException(status_code=400, detail="Invalid part.")
        question = Question(part=part, topic="User Custom", question_text=question_text)
        db.add(question)
        db.commit()
        db.refresh(question)
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either question_id, or question_text and part.",
        )

    valid_extensions = (".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac")
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid audio file format")

    try:
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="video",
            folder="ielts_audio",
        )
        filepath = result["secure_url"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload audio: {str(e)}")

    assigned_teacher_id = None
    if teacher_id:
        teacher = db.query(User).filter(User.id == teacher_id, User.role == "teacher", User.is_approved == True).first()
        if teacher:
            assigned_teacher_id = teacher.id

    submission = Submission(
        user_id=current_user.id,
        question_id=question.id,
        audio_file_path=filepath,
        status="pending",
        assigned_teacher_id=assigned_teacher_id,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    background_tasks.add_task(process_submission_background, submission.id)
    return {"message": "Submission received and is being processed", "submission_id": submission.id}


def process_submission_background(submission_id: int):
    db = SessionLocal()
    submission = None
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return

        question = submission.question

        transcript_text = transcribe_audio(submission.audio_file_path)
        submission.transcript = transcript_text
        submission.status = "transcribed"
        db.commit()

        print(f">>> [DEBUG] CALLING GEMINI API FOR EVALUATION (SUBMISSION {submission_id})")
        evaluation_result = evaluate_with_ai(transcript_text, question.question_text, question.part)

        if evaluation_result:
            ai_eval = AiEvaluation(
                submission_id=submission.id,
                fluency_score=evaluation_result["fluency_coherence"]["score"],
                lexical_score=evaluation_result["lexical_resource"]["score"],
                grammar_score=evaluation_result["grammar"]["score"],
                overall_score=evaluation_result["overall_band"],
                strengths=json.dumps({
                    "fluency": evaluation_result["fluency_coherence"]["strengths"],
                    "lexical": evaluation_result["lexical_resource"]["strengths"],
                    "grammar": evaluation_result["grammar"]["strengths"],
                }),
                areas_for_improvement=json.dumps({
                    "key_mistakes": evaluation_result["key_mistakes"],
                    "suggestions": evaluation_result["improvement_suggestions"],
                }),
                raw_llm_response=evaluation_result,
            )
            db.add(ai_eval)
            submission.status = "ai_evaluated"
            db.commit()

    except Exception as e:
        import traceback
        traceback.print_exc()
        if submission:
            submission.status = "failed"
            db.commit()
    finally:
        db.close()


def get_submissions(db: Session, current_user: User, page: Optional[int] = None, limit: int = 10):
    query = db.query(Submission).options(
        joinedload(Submission.question),
        joinedload(Submission.ai_evaluation),
        joinedload(Submission.teacher_review),
        joinedload(Submission.user),
        joinedload(Submission.assigned_teacher),
    )

    if current_user.role == "student":
        query = query.filter(Submission.user_id == current_user.id)

    query = query.order_by(Submission.submitted_at.desc())

    if page is not None:
        total = query.count()
        total_pages = math.ceil(total / limit) if total > 0 else 1
        submissions = query.offset((page - 1) * limit).limit(limit).all()
    else:
        submissions = query.all()

    results = []
    for sub in submissions:
        ai_score = sub.ai_evaluation.overall_score if sub.ai_evaluation else None
        teacher_score = sub.teacher_review.final_overall_score if sub.teacher_review else None
        overall_score = teacher_score if teacher_score is not None else ai_score
        results.append({
            "id": sub.id,
            "student_name": sub.user.full_name if sub.user else None,
            "question": sub.question.question_text if sub.question else None,
            "part": sub.question.part if sub.question else None,
            "status": sub.status,
            "submitted_at": sub.submitted_at,
            "score": overall_score,
            "ai_overall_score": ai_score,
            "teacher_overall_score": teacher_score,
            "audio_file_path": f"/{sub.audio_file_path}",
            "assigned_teacher_id": sub.assigned_teacher_id,
            "assigned_teacher_name": sub.assigned_teacher.full_name if sub.assigned_teacher else None,
        })

    if page is not None:
        return {"items": results, "total": total, "page": page, "limit": limit, "total_pages": total_pages}
    return results


def get_submission_detail(submission_id: int, db: Session, current_user: User):
    submission = (
        db.query(Submission)
        .options(
            joinedload(Submission.question),
            joinedload(Submission.ai_evaluation),
            joinedload(Submission.user),
            joinedload(Submission.assigned_teacher),
        )
        .filter(Submission.id == submission_id)
        .first()
    )

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if current_user.role == "student" and submission.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this submission")


    return {
        "id": submission.id,
        "student_name": submission.user.full_name,
        "question": {
            "part": submission.question.part,
            "text": submission.question.question_text,
        },
        "audio_url": f"/{submission.audio_file_path}",
        "transcript": submission.transcript,
        "status": submission.status,
        "submitted_at": submission.submitted_at,
        "ai_evaluation": submission.ai_evaluation.raw_llm_response if submission.ai_evaluation else None,
        "assigned_teacher_id": submission.assigned_teacher_id,
        "assigned_teacher_name": submission.assigned_teacher.full_name if submission.assigned_teacher else None,
    }


def assign_teacher(submission_id: int, teacher_id: Optional[int], db: Session, current_user: User):
    submission = db.query(Submission).filter(
        Submission.id == submission_id,
        Submission.user_id == current_user.id,
    ).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if teacher_id is not None:
        teacher = db.query(User).filter(
            User.id == teacher_id, User.role == "teacher", User.is_approved == True
        ).first()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        submission.assigned_teacher_id = teacher_id
        name = teacher.full_name
    else:
        submission.assigned_teacher_id = None
        name = None

    db.commit()
    return {"assigned_teacher_id": submission.assigned_teacher_id, "assigned_teacher_name": name}


def get_dashboard_summary(db: Session, current_user: User):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Not authorized")

    submissions = (
        db.query(Submission)
        .options(
            joinedload(Submission.ai_evaluation),
            joinedload(Submission.teacher_review),
        )
        .filter(Submission.user_id == current_user.id)
        .all()
    )

    pending_statuses = ["pending", "transcribed", "ai_evaluated"]
    pending_review = sum(1 for s in submissions if s.status in pending_statuses and not s.teacher_review)
    reviewed = sum(1 for s in submissions if s.status == "completed" or s.teacher_review)

    scores = []
    for sub in submissions:
        if sub.teacher_review and sub.teacher_review.final_overall_score is not None:
            scores.append(float(sub.teacher_review.final_overall_score))
        elif sub.ai_evaluation and sub.ai_evaluation.overall_score is not None:
            scores.append(float(sub.ai_evaluation.overall_score))

    avg_overall_band = round(sum(scores) / len(scores), 1) if scores else 0.0

    return {
        "total_submissions": len(submissions),
        "avg_overall_band": avg_overall_band,
        "pending_review": pending_review,
        "reviewed": reviewed,
    }


def submit_teacher_review(submission_id: int, payload: TeacherReviewPayload, db: Session, current_user: User):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can submit reviews.")

    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")

    if not (0 <= payload.pronunciation_score <= 9):
        raise HTTPException(status_code=400, detail="Score must be between 0.0 and 9.0")
    if len(payload.teacher_feedback.strip()) < 20:
        raise HTTPException(status_code=400, detail="Review must be at least 20 characters.")

    ai_eval = submission.ai_evaluation
    fluency = payload.adjusted_fluency or (float(ai_eval.fluency_score) if ai_eval and ai_eval.fluency_score else None)
    lexical = payload.adjusted_lexical or (float(ai_eval.lexical_score) if ai_eval and ai_eval.lexical_score else None)
    grammar = payload.adjusted_grammar or (float(ai_eval.grammar_score) if ai_eval and ai_eval.grammar_score else None)

    scores = [s for s in [payload.pronunciation_score, fluency, lexical, grammar] if s is not None]
    computed_overall = round(sum(scores) / len(scores) * 2) / 2 if scores else None
    final_score = payload.final_overall_score or computed_overall

    existing = (
        db.query(TeacherReview)
        .filter(
            TeacherReview.submission_id == submission_id,
            TeacherReview.teacher_id == current_user.id,
        )
        .first()
    )

    if existing:
        existing.pronunciation_score = payload.pronunciation_score
        existing.adjusted_fluency = payload.adjusted_fluency
        existing.adjusted_lexical = payload.adjusted_lexical
        existing.adjusted_grammar = payload.adjusted_grammar
        existing.final_overall_score = final_score
        existing.teacher_feedback = payload.teacher_feedback
    else:
        db.add(TeacherReview(
            submission_id=submission_id,
            teacher_id=current_user.id,
            pronunciation_score=payload.pronunciation_score,
            adjusted_fluency=payload.adjusted_fluency,
            adjusted_lexical=payload.adjusted_lexical,
            adjusted_grammar=payload.adjusted_grammar,
            final_overall_score=final_score,
            teacher_feedback=payload.teacher_feedback,
        ))

    submission.status = "completed"
    db.commit()
    return {"message": "Review submitted successfully", "final_overall_score": final_score}


def get_teacher_review(submission_id: int, db: Session, current_user: User):
    if current_user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized.")

    review = db.query(TeacherReview).filter(TeacherReview.submission_id == submission_id).first()
    if not review:
        return None

    return {
        "id": review.id,
        "pronunciation_score": float(review.pronunciation_score) if review.pronunciation_score else None,
        "adjusted_fluency": float(review.adjusted_fluency) if review.adjusted_fluency else None,
        "adjusted_lexical": float(review.adjusted_lexical) if review.adjusted_lexical else None,
        "adjusted_grammar": float(review.adjusted_grammar) if review.adjusted_grammar else None,
        "final_overall_score": float(review.final_overall_score) if review.final_overall_score else None,
        "teacher_feedback": review.teacher_feedback,
        "reviewed_at": review.reviewed_at,
    }
