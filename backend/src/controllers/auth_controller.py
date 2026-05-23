from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.models.db_models import User
from src.models.schemas import UserLogin, UserRegister
from src.services.auth_service import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_password_hash,
    verify_password,
)


def register(user_data: UserRegister, db: Session):
    if user_data.role not in ["student", "teacher", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role,
        status='pending',
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created successfully"}


def login(user_data: UserLogin, db: Session):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user_data.role and user.role != user_data.role:
        raise HTTPException(status_code=401, detail=f"User is not a {user_data.role}")

    if user.status == 'pending':
        raise HTTPException(status_code=403, detail="Account pending admin approval")
    if user.status == 'rejected':
        raise HTTPException(status_code=403, detail="Account has been rejected")

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


def get_me(current_user: User):
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "status": current_user.status,
    }
