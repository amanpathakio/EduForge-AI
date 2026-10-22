import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, DateTime
from app.db.base import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Citation(Base):
    __tablename__ = "citations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False, index=True)  # e.g., "lecture_slide", "chat_message"
    entity_id = Column(String(36), nullable=False, index=True)    # foreign key / id of the entity
    document_id = Column(String(36), nullable=True)
    chunk_id = Column(String(100), nullable=True)
    page_number = Column(Integer, nullable=True)
    filename = Column(String(255), nullable=False)
    distance = Column(Float, nullable=True)
    chunk_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
