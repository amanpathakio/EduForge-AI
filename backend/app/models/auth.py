import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base

def utc_now():
    return datetime.now(timezone.utc)

class Profile(Base):
    __tablename__ = "profiles"
    # This is the immutable Supabase auth.users UUID; credentials remain in Supabase.
    id = Column(String(128), primary_key=True)
    email = Column(String(320), nullable=True, unique=True, index=True)
    role = Column(String(24), nullable=False, default="student")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    memberships = relationship("CourseMembership", back_populates="profile", cascade="all, delete-orphan")

class CourseMembership(Base):
    __tablename__ = "course_memberships"
    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_course_membership"),)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(128), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(24), nullable=False, default="student") # student | professor
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    course = relationship("Course", back_populates="memberships")
    profile = relationship("Profile", back_populates="memberships")
