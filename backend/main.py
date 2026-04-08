from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from auth import router as auth_router
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

from submissions import router as submissions_router
app.include_router(submissions_router, prefix="/api/v1", tags=["submissions"])

import os
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

from ml_models import whisper_model

@app.get("/")
def root():
    return {"message": "Backend OK, database connected!"}