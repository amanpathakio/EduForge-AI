from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator

class QuizQuestionCreate(BaseModel):
    prompt: str = Field(min_length=4)
    options: List[str] = Field(min_length=2, max_length=6)
    correct_option: int = Field(ge=0)
    explanation: str = Field(min_length=4)
    learning_objective: Optional[str] = None
    source_chunk_id: Optional[str] = None
    source_page: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def correct_option_exists(self):
        if self.correct_option >= len(self.options):
            raise ValueError("correct_option must point to one of the supplied options")
        return self

class QuizCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    questions: List[QuizQuestionCreate] = Field(min_length=1, max_length=30)

class QuizGenerateRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=255)
    question_count: int = Field(default=5, ge=3, le=15)
    difficulty: str = Field(default="intermediate")

class QuizQuestionRead(QuizQuestionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    position: int

class QuizRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    course_id: str
    module_id: Optional[str] = None
    title: str
    status: str
    questions: List[QuizQuestionRead]
    created_at: datetime
    updated_at: datetime

class QuizAttemptCreate(BaseModel):
    selected_option: int = Field(ge=0)

class QuizFeedback(BaseModel):
    correct: bool
    correct_option: int
    explanation: str
    source_page: Optional[int] = None
