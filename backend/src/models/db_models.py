from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text, Numeric, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from src.utils.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum('student', 'teacher', 'admin', name='user_roles'), nullable=False)
    is_approved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    submissions = relationship("Submission", back_populates="user", foreign_keys="Submission.user_id")
    reviews_given = relationship("TeacherReview", back_populates="teacher")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    part = Column(Enum('part1', 'part2', 'part3', name='question_parts'), nullable=False)
    topic = Column(String(200))
    question_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    submissions = relationship("Submission", back_populates="question")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    assigned_teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    audio_file_path = Column(String(500), nullable=False)
    transcript = Column(Text)
    status = Column(Enum('pending', 'transcribed', 'ai_evaluated', 'completed', 'failed', name='submission_statuses'), default='pending', nullable=False)
    submitted_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id], back_populates="submissions")
    question = relationship("Question", back_populates="submissions")
    assigned_teacher = relationship("User", foreign_keys=[assigned_teacher_id])
    ai_evaluation = relationship("AiEvaluation", back_populates="submission", uselist=False)
    teacher_review = relationship("TeacherReview", back_populates="submission", uselist=False)


class AiEvaluation(Base):
    __tablename__ = "ai_evaluations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), unique=True, nullable=False)
    fluency_score = Column(Numeric(3, 1))
    lexical_score = Column(Numeric(3, 1))
    grammar_score = Column(Numeric(3, 1))
    overall_score = Column(Numeric(3, 1))
    strengths = Column(Text)
    areas_for_improvement = Column(Text)
    raw_llm_response = Column(JSON)
    evaluated_at = Column(DateTime, default=func.now(), nullable=False)

    submission = relationship("Submission", back_populates="ai_evaluation")


class TeacherReview(Base):
    __tablename__ = "teacher_reviews"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pronunciation_score = Column(Numeric(3, 1))
    adjusted_fluency = Column(Numeric(3, 1))
    adjusted_lexical = Column(Numeric(3, 1))
    adjusted_grammar = Column(Numeric(3, 1))
    final_overall_score = Column(Numeric(3, 1))
    teacher_feedback = Column(Text)
    reviewed_at = Column(DateTime, default=func.now(), nullable=False)

    submission = relationship("Submission", back_populates="teacher_review")
    teacher = relationship("User", back_populates="reviews_given")
