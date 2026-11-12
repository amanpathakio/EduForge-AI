import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base

def utc_now():
    return datetime.now(timezone.utc)

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(String(128), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(320), nullable=True, unique=True, index=True)
    full_name = Column(String(160), nullable=True)
    password_hash = Column(String(512), nullable=True)
    auth_provider = Column(String(32), nullable=False, default="local")
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

class CourseInvite(Base):
    __tablename__ = "course_invites"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), nullable=False, unique=True, index=True)
    created_by = Column(String(128), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    uses_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
