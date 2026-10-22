# EduForge AI Backend Main Entrypoint
import os
os.environ.pop("SSLKEYLOGFILE", None)

import logging
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.db.session import init_db
from app.api.routes import router as api_router
from app.api.courses import router as courses_router
from app.api.lectures import router as lectures_router
from app.api.quizzes import router as quizzes_router

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("eduforge")

# Initialize FastAPI app
app = FastAPI(
    title="EduForge AI - Educational Workspace API",
    description="Course-grounded RAG, Course Management, and AI Lecture Studio API.",
    version="1.1.0"
)

# Enable CORS for local development
allowed_origins = [origin.strip() for origin in settings.FRONTEND_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router)
app.include_router(courses_router)
app.include_router(lectures_router)
app.include_router(quizzes_router)

# Locate and mount frontend files. Prefer React production build in `frontend/dist` when available,
# otherwise fallback to legacy `backend/frontend`.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
REACT_BUILD_DIR = PROJECT_ROOT / "frontend" / "dist"
LEGACY_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

if REACT_BUILD_DIR.exists() and (REACT_BUILD_DIR / "index.html").exists():
    FRONTEND_DIR = REACT_BUILD_DIR
    if (REACT_BUILD_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(REACT_BUILD_DIR / "assets")), name="assets")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
else:
    FRONTEND_DIR = LEGACY_FRONTEND_DIR
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/{full_path:path}")
async def serve_frontend_spa(full_path: str):
    """
    Serve static files or fallback to index.html to support SPA client-side routing.
    """
    file_path = FRONTEND_DIR / full_path
    if full_path and file_path.is_file():
        return FileResponse(str(file_path))

    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        return {"message": "EduForge AI Backend is running. Frontend static files not found."}
    return FileResponse(str(index_path))


@app.on_event("startup")
def startup_event():
    settings.validate_directories()
    init_db()
    logger.info("EduForge AI Educational Workspace API initialized successfully.")
    logger.info(f"Using Embedding Model: {settings.EMBEDDING_MODEL_NAME}")
    logger.info(f"ChromaDB Directory: {settings.CHROMA_DB_DIR}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

