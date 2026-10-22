import logging
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.lecture import (
    LectureGenerateRequest,
    LectureUpdate,
    LectureRead,
    LectureSummaryRead,
    SlideRead,
    SlideUpdate,
    SlideRegenerateRequest
)
from app.services.lecture_service import LectureService
from app.auth import require_course_access, require_course_manager, require_lecture_access, require_lecture_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Lectures"])

# Course-specific lecture endpoints
@router.post("/courses/{course_id}/lectures/generate", response_model=LectureRead, status_code=status.HTTP_201_CREATED)
def generate_course_lecture(course_id: str, request: LectureGenerateRequest, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    """
    Generate a grounded course lecture strictly based on documents uploaded to the course.
    """
    return LectureService.generate_lecture(db, course_id, request)

@router.get("/courses/{course_id}/lectures", response_model=List[LectureSummaryRead])
def list_course_lectures(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_access)):
    """List all saved lectures for a specific course."""
    return LectureService.get_lectures_for_course(db, course_id)

# Individual lecture endpoints
@router.get("/lectures/{lecture_id}", response_model=LectureRead)
def get_lecture(lecture_id: str, db: Session = Depends(get_db), _lecture=Depends(require_lecture_access)):
    """Retrieve full lecture with all slides and verified citations."""
    return LectureService.get_lecture_with_slides(db, lecture_id)

@router.patch("/lectures/{lecture_id}", response_model=LectureRead)
def update_lecture(lecture_id: str, request: LectureUpdate, db: Session = Depends(get_db), _lecture=Depends(require_lecture_manager)):
    """Update lecture metadata (title, topic, duration, status, etc.)."""
    return LectureService.update_lecture(db, lecture_id, request)

@router.delete("/lectures/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lecture(lecture_id: str, db: Session = Depends(get_db), _lecture=Depends(require_lecture_manager)):
    """Delete a lecture and its slides/citations."""
    LectureService.delete_lecture(db, lecture_id)
    return None

# Slide-specific endpoints
@router.patch("/lectures/{lecture_id}/slides/{slide_id}", response_model=SlideRead)
def update_lecture_slide(lecture_id: str, slide_id: str, request: SlideUpdate, db: Session = Depends(get_db), _lecture=Depends(require_lecture_manager)):
    """Update a specific slide's title, bullet content, or speaker notes."""
    return LectureService.update_slide(db, lecture_id, slide_id, request)

@router.delete("/lectures/{lecture_id}/slides/{slide_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lecture_slide(lecture_id: str, slide_id: str, db: Session = Depends(get_db), _lecture=Depends(require_lecture_manager)):
    """Delete a slide from a lecture and renumber remaining slides."""
    LectureService.delete_slide(db, lecture_id, slide_id)
    return None

@router.post("/lectures/{lecture_id}/slides/{slide_id}/regenerate", response_model=SlideRead)
def regenerate_lecture_slide(
    lecture_id: str,
    slide_id: str,
    request: SlideRegenerateRequest,
    db: Session = Depends(get_db), _lecture=Depends(require_lecture_manager)
):
    """
    Targeted regeneration of ONE slide:
    - Does NOT regenerate the entire lecture.
    - Retrieves relevant source context again from the course.
    - Replaces citations with verified citations relevant to the newly generated content.
    """
    return LectureService.regenerate_slide(db, lecture_id, slide_id, request)
