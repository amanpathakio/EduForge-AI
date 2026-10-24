import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.db.base import Base

def _uuid():
    return str(uuid.uuid4())

def _now():
    return datetime.now(timezone.utc)

class Quiz(Base):
    __tablename__ = "quizzes"
    id = Column(String(36), primary_key=True, default=_uuid)
    course_id = Column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id = Column(String(36), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    status = Column(String(24), nullable=False, default="draft")  # draft | published
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    course = relationship("Course", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan", order_by="QuizQuestion.position")

class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    id = Column(String(36), primary_key=True, default=_uuid)
    quiz_id = Column(String(36), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    prompt = Column(Text, nullable=False)
    options = Column(JSON, nullable=False, default=list)
    correct_option = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=False)
    learning_objective = Column(String(255), nullable=True)
    source_chunk_id = Column(String(100), nullable=True)
    source_page = Column(Integer, nullable=True)
    quiz = relationship("Quiz", back_populates="questions")
    attempts = relationship("QuizAttempt", back_populates="question", cascade="all, delete-orphan")

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id = Column(String(36), primary_key=True, default=_uuid)
    question_id = Column(String(36), ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    learner_id = Column(String(100), nullable=False, index=True)
    selected_option = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    question = relationship("QuizQuestion", back_populates="attempts")
