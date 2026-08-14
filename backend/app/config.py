import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base backend directory
BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    """
    EduForge AI Phase 1 RAG Configuration Settings.
    Loaded automatically from environment variables or .env file.
    """
    GEMINI_API_KEY: str = ""
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"
    CHROMA_DB_DIR: str = str(BASE_DIR / "chroma_db")
    UPLOAD_DIR: str = str(BASE_DIR / "data" / "uploads")
    CHUNK_SIZE: int = 800
    CHUNK_OVERLAP: int = 150
    TOP_K: int = 4
    # Relevance filtering: distance threshold for accepting retrieved chunks from ChromaDB.
    # For Chroma configured with `hnsw:space` = "cosine", Chroma returns a cosine-distance
    # where smaller is more similar (0 = identical). Tune this via environment variable.
    RELEVANCE_DISTANCE_THRESHOLD: float = 0.45

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def validate_directories(self) -> None:
        """Ensure necessary directories exist on filesystem."""
        os.makedirs(self.CHROMA_DB_DIR, exist_ok=True)
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)

# Global settings instance
settings = Settings()
settings.validate_directories()
