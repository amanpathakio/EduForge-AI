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
    # Database Configuration (PostgreSQL with SQLite fallback)
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'eduforge.db'}"

    # ElevenLabs Voice Cloning & Audio Synthesis
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_MODEL_ID: str = "eleven_turbo_v2_5"
    ELEVENLABS_DEFAULT_VOICE_ID: str = "JBFqnCBsd6RMkjVDRZzb"
    AUDIO_DIR: str = str(BASE_DIR / "data" / "audio")

    # Relevance filtering: distance threshold for accepting retrieved chunks from ChromaDB.
    # For Chroma configured with `hnsw:space` = "cosine", Chroma returns a cosine-distance
    # where smaller is more similar (0 = identical). Tune this via environment variable.
    RELEVANCE_DISTANCE_THRESHOLD: float = 0.45
    # Supabase public values identify the issuer; the service-role key is never used here.
    SUPABASE_URL: str = ""
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    SUPABASE_JWKS_URL: str = ""
    # Built-in production JWT & educator onboarding settings
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080
    EDUCATOR_ACCESS_CODE: str = ""
    ADMIN_ACCESS_CODE: str = "EDUFORGE-ADMIN-2026"
    AUTH_REQUIRED: bool = True
    FRONTEND_ORIGINS: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_jwt_secret(self) -> str:
        """Return configured JWT secret or persist a cryptographically random local secret."""
        if self.JWT_SECRET_KEY:
            return self.JWT_SECRET_KEY
        secret_file = BASE_DIR / "data" / ".jwt_secret"
        secret_file.parent.mkdir(parents=True, exist_ok=True)
        if secret_file.exists():
            stored = secret_file.read_text(encoding="utf-8").strip()
            if stored:
                self.JWT_SECRET_KEY = stored
                return stored
        import secrets
        generated = secrets.token_urlsafe(48)
        secret_file.write_text(generated, encoding="utf-8")
        self.JWT_SECRET_KEY = generated
        return generated

    def validate_directories(self) -> None:
        """Ensure necessary directories exist on filesystem."""
        os.makedirs(self.CHROMA_DB_DIR, exist_ok=True)
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)

# Global settings instance
settings = Settings()
settings.validate_directories()
