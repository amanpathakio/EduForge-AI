from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

# Citation Schemas
class CitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entity_type: str
    entity_id: str
    document_id: Optional[str] = None
    chunk_id: Optional[str] = None
    page_number: Optional[int] = None
    filename: str
    distance: Optional[float] = None
    chunk_text: Optional[str] = None
    created_at: Optional[datetime] = None

# Slide Schemas
class SlideRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lecture_id: str
    slide_number: int
    title: str
    content: List[str] = Field(default_factory=list)
    speaker_notes: Optional[str] = ""
    citations: List[CitationRead] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class SlideUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[List[str]] = None
    speaker_notes: Optional[str] = None

class SlideRegenerateRequest(BaseModel):
    instruction: str = Field(..., min_length=2, description="Instruction for improving/regenerating this slide")

# Lecture Schemas
class LectureGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=1, description="Lecture topic")
    duration_minutes: int = Field(default=60, ge=15, le=180, description="Lecture duration in minutes")
    difficulty: str = Field(default="intermediate", description="Target difficulty: beginner, intermediate, advanced")
    slide_count: int = Field(default=10, ge=1, le=30, description="Target slide count (1 to 30)")
    additional_instructions: Optional[str] = Field(default=None, description="Additional custom instructions")

class LectureUpdate(BaseModel):
    title: Optional[str] = None
    topic: Optional[str] = None
    duration_minutes: Optional[int] = None
    difficulty: Optional[str] = None
    learning_objectives: Optional[List[str]] = None
    status: Optional[str] = None
    additional_instructions: Optional[str] = None

class LectureSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    topic: str
    duration_minutes: int
    difficulty: str
    learning_objectives: List[str] = Field(default_factory=list)
    status: str
    slide_count: int = 0
    created_at: datetime
    updated_at: datetime

class LectureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    topic: str
    duration_minutes: int
    difficulty: str
    learning_objectives: List[str] = Field(default_factory=list)
    status: str
    additional_instructions: Optional[str] = None
    slides: List[SlideRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

# --- LLM Output Validation Schemas (Strict Safety Guardrails) ---
class LLMSlideOutput(BaseModel):
    slide_number: int
    title: str = Field(..., min_length=1)
    content: List[str] = Field(..., min_length=1, description="Bullet points for the slide")
    speaker_notes: str = Field(default="", description="Detailed talking points for the presenter")
    cited_chunk_indices: List[int] = Field(default_factory=list, description="1-based integer indices of context chunks used")

class LLMLectureOutput(BaseModel):
    title: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)
    learning_objectives: List[str] = Field(..., min_length=1)
    slides: List[LLMSlideOutput] = Field(..., min_length=1)

class LLMSingleSlideOutput(BaseModel):
    title: str = Field(..., min_length=1)
    content: List[str] = Field(..., min_length=1)
    speaker_notes: str = Field(default="")
    cited_chunk_indices: List[int] = Field(default_factory=list)
