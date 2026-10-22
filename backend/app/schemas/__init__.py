from app.schemas.course import CourseCreate, CourseUpdate, CourseRead, DocumentRead
from app.schemas.lecture import (
    LectureGenerateRequest,
    LectureUpdate,
    LectureRead,
    LectureSummaryRead,
    SlideRead,
    SlideUpdate,
    SlideRegenerateRequest,
    CitationRead,
    LLMLectureOutput,
    LLMSlideOutput,
    LLMSingleSlideOutput
)
from app.schemas.chat import CourseChatRequest, ChatResponse

__all__ = [
    "CourseCreate",
    "CourseUpdate",
    "CourseRead",
    "DocumentRead",
    "LectureGenerateRequest",
    "LectureUpdate",
    "LectureRead",
    "LectureSummaryRead",
    "SlideRead",
    "SlideUpdate",
    "SlideRegenerateRequest",
    "CitationRead",
    "LLMLectureOutput",
    "LLMSlideOutput",
    "LLMSingleSlideOutput",
    "CourseChatRequest",
    "ChatResponse"
]
