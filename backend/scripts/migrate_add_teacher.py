"""
Migration: add assigned_teacher_id to submissions table
Run once: python migrate_add_teacher.py
"""
from dotenv import load_dotenv
load_dotenv()

from src.utils.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() "
        "AND table_name = 'submissions' "
        "AND column_name = 'assigned_teacher_id'"
    ))
    exists = result.scalar() > 0

    if exists:
        print("Column assigned_teacher_id already exists. Skipping.")
    else:
        conn.execute(text(
            "ALTER TABLE submissions "
            "ADD COLUMN assigned_teacher_id INT NULL, "
            "ADD CONSTRAINT fk_assigned_teacher "
            "FOREIGN KEY (assigned_teacher_id) REFERENCES users(id) ON DELETE SET NULL"
        ))
        conn.commit()
        print("Added column assigned_teacher_id to submissions.")
