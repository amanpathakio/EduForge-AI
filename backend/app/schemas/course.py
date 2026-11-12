from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

class CourseBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Course title")
    description: Optional[str] = Field(default="", description="Course description")

class CourseCreate(CourseBase):
    pass

class CourseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None

class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    filename: str
    pages_count: int
    chunks_count: int
    created_at: datetime

class CourseRead(CourseBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    lecture_count: int = 0
    published_lecture_count: int = 0
    my_role: str = "student"


class CourseInviteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    code: str
    is_active: bool
    uses_count: int
    expires_at: Optional[datetime] = None
    created_at: datetime


class CourseJoinRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=32)


class CourseStudentRead(BaseModel):
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    joined_at: datetime
    quiz_attempts_count: int = 0
    correct_answers_count: int = 0
