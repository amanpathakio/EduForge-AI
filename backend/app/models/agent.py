import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base

def _id(): return str(uuid.uuid4())
def _now(): return datetime.now(timezone.utc)

class AgentRun(Base):
    __tablename__ = "agent_runs"
    id = Column(String(36), primary_key=True, default=_id)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    initiated_by = Column(String(128), ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    agent_type = Column(String(64), nullable=False, default="course_architect")
    goal = Column(Text, nullable=False)
    status = Column(String(24), nullable=False, default="queued") # queued | running | awaiting_approval | completed | failed
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    steps = relationship("AgentRunStep", back_populates="run", cascade="all, delete-orphan", order_by="AgentRunStep.position")

class AgentRunStep(Base):
    __tablename__ = "agent_run_steps"
    id = Column(String(36), primary_key=True, default=_id)
    run_id = Column(String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    tool = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    status = Column(String(24), nullable=False, default="queued")
    detail = Column(Text, nullable=True)
    output = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    run = relationship("AgentRun", back_populates="steps")
