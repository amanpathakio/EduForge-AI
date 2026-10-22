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
