"""
Migration: replace is_approved (Boolean) with status (ENUM pending/approved/rejected)
Run once: python scripts/migrate_status.py
"""
from dotenv import load_dotenv
load_dotenv()

from src.utils.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Check if status column already exists
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() "
        "AND table_name = 'users' "
        "AND column_name = 'status'"
    ))
    status_exists = result.scalar() > 0

    if status_exists:
        print("Column 'status' already exists. Skipping migration.")
    else:
        # Add status column
        conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'"
        ))

        # Migrate data: is_approved=1 → approved, is_approved=0 → pending
        conn.execute(text(
            "UPDATE users SET status = CASE WHEN is_approved = 1 THEN 'approved' ELSE 'pending' END"
        ))

        # Drop old column
        conn.execute(text("ALTER TABLE users DROP COLUMN is_approved"))

        conn.commit()
        print("Migration complete: is_approved → status")
