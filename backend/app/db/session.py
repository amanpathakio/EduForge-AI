import os
import logging
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from app.config import settings
from app.db.base import Base

logger = logging.getLogger(__name__)

def get_database_url() -> str:
    url = settings.DATABASE_URL
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url

db_url = get_database_url()
connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False,
    future=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _ensure_profile_columns():
    """Safely add Stage 2 auth columns to pre-existing databases."""
    inspector = inspect(engine)
    if "profiles" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("profiles")}
    statements = []
    if "full_name" not in existing:
        statements.append("ALTER TABLE profiles ADD COLUMN full_name VARCHAR(160)")
    if "password_hash" not in existing:
        statements.append("ALTER TABLE profiles ADD COLUMN password_hash VARCHAR(512)")
    if "auth_provider" not in existing:
        statements.append("ALTER TABLE profiles ADD COLUMN auth_provider VARCHAR(32) NOT NULL DEFAULT 'local'")
    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

def init_db():
    """Ensure database tables and incremental columns are created."""
    try:
        import app.models  # noqa: F401 - ensure models are registered with Base
        Base.metadata.create_all(bind=engine)
        _ensure_profile_columns()
        logger.info(f"Database initialized successfully with URL: {db_url}")
    except Exception as e:
        logger.error(f"Failed to initialize database tables: {str(e)}")
        raise
