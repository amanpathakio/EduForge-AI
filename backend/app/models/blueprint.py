import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base

def _id(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)

class CourseBlueprint(Base):
    __tablename__ = "course_blueprints"
    id = Column(String(36), primary_key=True, default=_id)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_run_id = Column(String(36), ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    summary = Column(Text, nullable=True)
    status = Column(String(24), nullable=False, default="draft") # draft | approved | archived
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    modules = relationship("CourseModule", back_populates="blueprint", cascade="all, delete-orphan", order_by="CourseModule.position")

class CourseModule(Base):
    __tablename__ = "course_modules"
    id = Column(String(36), primary_key=True, default=_id)
    blueprint_id = Column(String(36), ForeignKey("course_blueprints.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    objective = Column(Text, nullable=False)
    evidence_pages = Column(JSON, nullable=False, default=list)
    status = Column(String(24), nullable=False, default="draft") # draft | approved
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    blueprint = relationship("CourseBlueprint", back_populates="modules")
