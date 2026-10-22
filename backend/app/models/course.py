import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Course(Base):
    __tablename__ = "courses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True, default="")
    owner_id = Column(String(128), ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    documents = relationship("Document", back_populates="course", cascade="all, delete-orphan", lazy="selectin")
    lectures = relationship("Lecture", back_populates="course", cascade="all, delete-orphan", lazy="selectin")
    quizzes = relationship("Quiz", back_populates="course", cascade="all, delete-orphan", lazy="selectin")
    memberships = relationship("CourseMembership", back_populates="course", cascade="all, delete-orphan")
