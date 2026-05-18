import os
from dotenv import load_dotenv

load_dotenv()

from src.utils.database import SessionLocal, engine, Base
import src.models.db_models  # registers all models with Base
from src.models.db_models import User
from src.services.auth_service import get_password_hash

# Create tables
Base.metadata.create_all(bind=engine)

def seed_users():
    db = SessionLocal()
    
    users_to_add = [
        # Admin
        {
            "full_name": "System Admin",
            "email": "admin@example.com",
            "password": "password123",
            "role": "admin",
            "is_approved": True
        },
        # Teachers
        {
            "full_name": "Teacher One",
            "email": "teacher1@example.com",
            "password": "password123",
            "role": "teacher",
            "is_approved": True
        },
        {
            "full_name": "Teacher Two",
            "email": "teacher2@example.com",
            "password": "password123",
            "role": "teacher",
            "is_approved": True
        },
        {
            "full_name": "Teacher Three",
            "email": "teacher3@example.com",
            "password": "password123",
            "role": "teacher",
            "is_approved": True
        },
        # Students
        {
            "full_name": "Student A",
            "email": "studenta@example.com",
            "password": "password123",
            "role": "student",
            "is_approved": True
        },
        {
            "full_name": "Student B",
            "email": "studentb@example.com",
            "password": "password123",
            "role": "student",
            "is_approved": True
        },
        {
            "full_name": "Student C",
            "email": "studentc@example.com",
            "password": "password123",
            "role": "student",
            "is_approved": True
        }
    ]

    for user_data in users_to_add:
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == user_data["email"]).first()
        if existing_user:
            print(f"User {user_data['email']} already exists. Skipping.")
            continue
            
        hashed_password = get_password_hash(user_data["password"])
        new_user = User(
            full_name=user_data["full_name"],
            email=user_data["email"],
            password_hash=hashed_password,
            role=user_data["role"],
            is_approved=user_data["is_approved"]
        )
        db.add(new_user)
        print(f"Added {user_data['role']}: {user_data['email']}")

    db.commit()
    db.close()
    print("Database seeding completed.")

if __name__ == "__main__":
    seed_users()
