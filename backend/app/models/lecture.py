import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id = Column(String(36), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    topic = Column(String(255), nullable=False)
    duration_minutes = Column(Integer, default=60)
    difficulty = Column(String(50), default="intermediate")  # beginner, intermediate, advanced
    learning_objectives = Column(JSON, default=list)        # list of string objectives
    status = Column(String(50), default="draft")            # draft, completed, archived
    additional_instructions = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    course = relationship("Course", back_populates="lectures")
    slides = relationship(
        "LectureSlide",
        back_populates="lecture",
        cascade="all, delete-orphan",
        order_by="LectureSlide.slide_number",
        lazy="selectin"
    )

class LectureSlide(Base):
    __tablename__ = "lecture_slides"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    lecture_id = Column(String(36), ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(JSON, default=list)                    # list of bullet point strings
    speaker_notes = Column(Text, nullable=True, default="")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    lecture = relationship("Lecture", back_populates="slides")
