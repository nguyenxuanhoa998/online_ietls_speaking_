"""
Migration: replace is_approved (Boolean) with status VARCHAR(20).
Runs automatically on startup. Compatible with MySQL and PostgreSQL.
"""
from sqlalchemy import inspect, text


def run_migration(engine):
    inspector = inspect(engine)

    if 'users' not in inspector.get_table_names():
        return  # fresh DB — create_all will build it correctly

    columns = {col['name'] for col in inspector.get_columns('users')}

    if 'status' in columns and 'is_approved' not in columns:
        print("migrate_status: already done, skipping.")
        return

    with engine.begin() as conn:
        if 'status' not in columns:
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'"
            ))
            print("migrate_status: added 'status' column.")

        if 'is_approved' in columns:
            conn.execute(text(
                "UPDATE users SET status = "
                "CASE WHEN is_approved IN (1, true, 't', 'TRUE') THEN 'approved' ELSE 'pending' END"
            ))
            conn.execute(text("ALTER TABLE users DROP COLUMN is_approved"))
            print("migrate_status: migrated data, dropped 'is_approved'.")

    print("migrate_status: complete.")
