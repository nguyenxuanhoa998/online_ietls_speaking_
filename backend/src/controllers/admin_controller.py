from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.models.db_models import AiEvaluation, Question, Submission, TeacherReview, User
from src.services.auth_service import get_current_user


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def get_admin_stats(db: Session, admin: User):
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_users = db.query(User).count()
    total_submissions = db.query(Submission).count()
    students = db.query(User).filter(User.role == "student", User.status == "approved").count()
    teachers = db.query(User).filter(User.role == "teacher", User.status == "approved").count()
    admins = db.query(User).filter(User.role == "admin", User.status == "approved").count()
    teachers_pending = db.query(User).filter(User.role == "teacher", User.status == "pending").count()
    admins_pending = db.query(User).filter(User.role == "admin", User.status == "pending").count()
    users_this_week = db.query(User).filter(User.created_at >= week_ago).count()
    students_this_week = db.query(User).filter(User.role == "student", User.created_at >= week_ago).count()
    submissions_month = db.query(Submission).filter(Submission.submitted_at >= month_ago).count()
    pending_reviews = db.query(Submission).filter(
        Submission.status.in_(["pending", "transcribed", "ai_evaluated"])
    ).count()

    avg_band_row = db.query(func.avg(AiEvaluation.overall_score)).scalar()
    avg_band = float(avg_band_row) if avg_band_row else 0.0

    return {
        "total_users": total_users,
        "total_submissions": total_submissions,
        "students": students,
        "teachers": teachers,
        "admins": admins,
        "teachers_pending": teachers_pending,
        "admins_pending": admins_pending,
        "users_this_week": users_this_week,
        "students_this_week": students_this_week,
        "submissions_this_month": submissions_month,
        "pending_reviews": pending_reviews,
        "avg_band": round(avg_band, 1) if avg_band else None,
        "storage_pct": 68,
        "api_quota_pct": 42,
    }


def get_all_users(db: Session, admin: User):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "institution": "",
        }
        for u in users
    ]


def approve_user(user_id: int, db: Session, admin: User):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status == "approved":
        raise HTTPException(status_code=400, detail="User already approved")
    user.status = "approved"
    db.commit()
    return {"message": f"User {user.full_name} approved successfully"}


def reject_user(user_id: int, db: Session, admin: User):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status == "approved":
        raise HTTPException(status_code=400, detail="Cannot reject an already-approved user")
    user.status = "rejected"
    db.commit()
    return {"message": f"User {user.full_name} rejected"}


def get_analytics(days: int, db: Session, admin: User):
    now = datetime.utcnow()
    since = now - timedelta(days=days)
    prev = since - timedelta(days=days)

    period_subs = db.query(Submission).filter(Submission.submitted_at >= since).count()
    prev_subs = db.query(Submission).filter(
        Submission.submitted_at >= prev,
        Submission.submitted_at < since,
    ).count()

    total_users = db.query(User).count()
    new_users = db.query(User).filter(User.created_at >= since).count()

    avg_band_row = db.query(func.avg(AiEvaluation.overall_score)).scalar()
    avg_band = float(avg_band_row) if avg_band_row else 0.0

    ai_only = db.query(Submission).filter(Submission.status == "ai_evaluated").count()
    reviewed = db.query(Submission).filter(Submission.status == "completed").count()
    pending_proc = db.query(Submission).filter(Submission.status.in_(["pending", "transcribed"])).count()
    total_sub_all = ai_only + reviewed + pending_proc or 1
    completion_rate = round((reviewed / total_sub_all) * 100) if total_sub_all else 0

    interval_days = 1 if days <= 7 else (3 if days <= 30 else 10)
    timeline = []
    for i in range(int(days / interval_days) - 1, -1, -1):
        seg_start = now - timedelta(days=(i + 1) * interval_days)
        seg_end = now - timedelta(days=i * interval_days)
        count = db.query(Submission).filter(
            Submission.submitted_at >= seg_start,
            Submission.submitted_at < seg_end,
        ).count()
        label = f"{seg_end.day}/{seg_end.month}" if days <= 30 else f"W{seg_end.isocalendar()[1]}"
        timeline.append({"label": label, "count": count})

    score_rows = db.query(AiEvaluation.overall_score).all()
    dist = {"9": 0, "8": 0, "7": 0, "6": 0, "5": 0, "4": 0, "<4": 0}
    for (s,) in score_rows:
        if s is None:
            continue
        sv = float(s)
        if sv >= 8.5:
            dist["9"] += 1
        elif sv >= 7.5:
            dist["8"] += 1
        elif sv >= 6.5:
            dist["7"] += 1
        elif sv >= 5.5:
            dist["6"] += 1
        elif sv >= 4.5:
            dist["5"] += 1
        elif sv >= 3.5:
            dist["4"] += 1
        else:
            dist["<4"] += 1

    top_rows = (
        db.query(
            User,
            func.avg(AiEvaluation.overall_score).label("avg_score"),
            func.count(Submission.id).label("cnt"),
        )
        .join(Submission, Submission.user_id == User.id)
        .join(AiEvaluation, AiEvaluation.submission_id == Submission.id)
        .filter(User.role == "student")
        .group_by(User.id)
        .order_by(func.avg(AiEvaluation.overall_score).desc())
        .limit(5)
        .all()
    )
    top_performers = [
        {"name": u.full_name, "score": round(float(sc), 1), "submissions": cnt}
        for u, sc, cnt in top_rows
        if sc
    ]

    return {
        "total_users": total_users,
        "period_submissions": period_subs,
        "avg_band": round(avg_band, 1),
        "completion_rate": completion_rate,
        "users_trend": new_users,
        "submissions_trend": period_subs - prev_subs,
        "submissions_timeline": timeline,
        "score_distribution": dist,
        "top_performers": top_performers,
        "evaluation_stats": {
            "ai_only": ai_only,
            "reviewed": reviewed,
            "pending_processing": pending_proc,
        },
    }


def get_activity(limit: int, db: Session, admin: User):
    activities = []

    recent_subs = (
        db.query(Submission, User, Question)
        .join(User, User.id == Submission.user_id)
        .join(Question, Question.id == Submission.question_id)
        .order_by(Submission.submitted_at.desc())
        .limit(10)
        .all()
    )
    for sub, user, q in recent_subs:
        part = q.part.replace("part", "Part ") if q.part else ""
        activities.append({
            "type": "blue",
            "text": f"<strong>{user.full_name}</strong> submitted a new recording ({part})",
            "time": sub.submitted_at.isoformat(),
        })

    recent_reviews = (
        db.query(TeacherReview, User, Submission)
        .join(User, User.id == TeacherReview.teacher_id)
        .join(Submission, Submission.id == TeacherReview.submission_id)
        .order_by(TeacherReview.reviewed_at.desc())
        .limit(10)
        .all()
    )
    for review, teacher, sub in recent_reviews:
        student = db.query(User).filter(User.id == sub.user_id).first()
        activities.append({
            "type": "green",
            "text": f"<strong>{teacher.full_name}</strong> completed a review for <strong>{student.full_name if student else 'a student'}</strong>",
            "time": review.reviewed_at.isoformat(),
        })

    recent_reg = (
        db.query(User)
        .filter(User.status == "pending")
        .order_by(User.created_at.desc())
        .limit(5)
        .all()
    )
    for u in recent_reg:
        activities.append({
            "type": "orange",
            "text": f"New {u.role} account registered: <strong>{u.full_name}</strong> — awaiting approval",
            "time": u.created_at.isoformat(),
        })

    activities.sort(key=lambda x: x["time"], reverse=True)
    return activities[:limit]
