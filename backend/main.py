from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from src.utils.database import engine
import src.models.db_models  # registers all models with Base
from src.utils.database import Base
from src.routes.auth import router as auth_router
from src.routes.submissions import router as submissions_router
from src.routes.admin import router as admin_router

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(submissions_router, prefix="/api/v1", tags=["submissions"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["admin"])

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend")
SRC_DIR = os.path.join(FRONTEND_DIR, "src")
UPLOADS_DIR = os.getenv("UPLOAD_DIR", os.path.join(BASE_DIR, "uploads"))

os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/src", StaticFiles(directory=SRC_DIR), name="src")

# Map URL route name → file path inside src/
PAGE_MAP = {
    "login":               "pages/auth/login.html",
    "dashboard":           "pages/student/dashboard.html",
    "submission":          "pages/student/submission.html",
    "result":              "pages/student/result.html",
    "results":             "pages/student/results.html",
    "teacher-dashboard":   "pages/teacher/dashboard.html",
    "teacher-review":      "pages/teacher/review.html",
    "teacher-students":    "pages/teacher/students.html",
    "teacher-submissions": "pages/teacher/submissions.html",
    "admin-dashboard":     "pages/admin/dashboard.html",
    "admin-analytics":     "pages/admin/analytics.html",
    "admin-users":         "pages/admin/users.html",
    "admin-accounts":      "pages/admin/accounts.html",
}


@app.get("/")
def root():
    return FileResponse(os.path.join(SRC_DIR, "pages/auth/login.html"))


@app.get("/{page_name}.html")
def get_html_page(page_name: str):
    rel = PAGE_MAP.get(page_name)
    if rel:
        return FileResponse(os.path.join(SRC_DIR, rel))
    return {"error": f"Không tìm thấy trang {page_name}.html"}



if __name__ == "__main__":
    import uvicorn

    # "main:app" có nghĩa là: file tên main.py, biến tên app
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
