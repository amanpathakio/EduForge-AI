# EduForge AI Backend Main Entrypoint
# EduForge AI Backend Main Entrypoint
import logging
import sys
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.api.routes import router as api_router

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
    title="EduForge AI - Phase 1 RAG API",
    description="Course-grounded Retrieval-Augmented Generation API for EduForge AI.",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router)

# Locate and mount static frontend files. Prefer production build in `frontend/dist` when available.
FRONTEND_SRC_DIR = Path(__file__).resolve().parent.parent / "frontend"
FRONTEND_BUILD_DIR = FRONTEND_SRC_DIR / "dist"
# Serve the build directory if it exists, otherwise serve the source frontend directory (useful for dev).
FRONTEND_DIR = FRONTEND_BUILD_DIR if FRONTEND_BUILD_DIR.exists() else FRONTEND_SRC_DIR
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/")
async def serve_index():
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        return {"message": "EduForge AI Backend is running. Frontend static files not found."}
    return FileResponse(str(index_path))

@app.on_event("startup")
def startup_event():
    settings.validate_directories()
    logger.info("EduForge AI Phase 1 RAG API initialized successfully.")
    logger.info(f"Using Embedding Model: {settings.EMBEDDING_MODEL_NAME}")
    logger.info(f"ChromaDB Directory: {settings.CHROMA_DB_DIR}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

