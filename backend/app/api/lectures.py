import logging
from typing import List, Optional, Dict, Any
from pathlib import Path
from fastapi import APIRouter, Depends, status, Query, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models.lecture import Lecture, LectureSlide
from app.services.elevenlabs_service import ElevenLabsService
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
from app.auth import (
    get_current_user,
    is_course_manager,
    require_course_access,
    require_course_manager,
    require_lecture_access,
    require_lecture_manager,
)
from app.models.auth import Profile

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
def list_course_lectures(
    course_id: str,
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
    _course=Depends(require_course_access),
):
    """List lectures for a course; students only see published lectures."""
    return LectureService.get_lectures_for_course(
        db,
        course_id,
        include_drafts=is_course_manager(db, course_id, user),
    )

# Individual lecture endpoints
@router.get("/lectures/{lecture_id}", response_model=LectureRead)
def get_lecture(
    lecture_id: str,
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
    lecture=Depends(require_lecture_access),
):
    """Retrieve full lecture with slides and citations (published only for students)."""
    return LectureService.get_lecture_with_slides(
        db,
        lecture_id,
        allow_draft=is_course_manager(db, lecture.course_id, user),
    )

@router.post("/lectures/{lecture_id}/publish", response_model=LectureRead)
def publish_lecture(
    lecture_id: str,
    db: Session = Depends(get_db),
    _lecture=Depends(require_lecture_manager),
):
    """Professor approval gate making a lecture visible to enrolled students."""
    return LectureService.publish_lecture(db, lecture_id)

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

# Video Lecture Audio & Manifest Endpoints
@router.get("/lectures/{lecture_id}/slides/{slide_id}/audio")
def get_slide_audio_stream(
    lecture_id: str,
    slide_id: str,
    voice_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
    lecture=Depends(require_lecture_access)
):
    """
    Streams the generated MP3 audio file for a given lecture slide.
    """
    effective_voice = voice_id or "prof-brian-systems"
    voice_tag = effective_voice.replace("prof-", "")[:8]
    storage_dir = ElevenLabsService.get_audio_storage_dir(lecture_id)
    audio_path = storage_dir / f"slide_{slide_id}_{voice_tag}.mp3"

    if not audio_path.exists() or audio_path.stat().st_size == 0:
        # Fallback to any existing audio file for this slide
        candidates = list(storage_dir.glob(f"slide_{slide_id}_*.mp3"))
        if candidates and candidates[0].stat().st_size > 0:
            audio_path = candidates[0]
        else:
            # On-demand synthesis fallback: synthesize if missing so playback never 404s
            db_slide = db.scalar(select(LectureSlide).where(LectureSlide.id == slide_id))
            if db_slide:
                full_text = db_slide.speaker_notes or " ".join(db_slide.content or [db_slide.title])
                ElevenLabsService.synthesize_slide_audio(
                    lecture_id=lecture_id,
                    slide_id=slide_id,
                    text=full_text,
                    voice_id=voice_id
                )
                candidates = list(storage_dir.glob(f"slide_{slide_id}_*.mp3"))
                if candidates and candidates[0].stat().st_size > 0:
                    audio_path = candidates[0]
                else:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Audio could not be synthesized for this slide."
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Slide not found."
                )

    return FileResponse(
        path=str(audio_path),
        media_type="audio/mpeg",
        filename=f"lecture_{lecture_id}_slide_{slide_id}.mp3"
    )

@router.post("/lectures/{lecture_id}/slides/{slide_id}/synthesize-audio")
def synthesize_slide_audio(
    lecture_id: str,
    slide_id: str,
    voice_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _lecture=Depends(require_lecture_manager)
):
    """
    Synthesize audio for a single slide's speaker notes using ElevenLabs.
    """
    slide = db.scalar(
        select(LectureSlide).where(
            LectureSlide.id == slide_id,
            LectureSlide.lecture_id == lecture_id
        )
    )
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found")

    # Construct the speech text: title + speaker notes (or bullets if notes are empty)
    text_parts = []
    if slide.title:
        text_parts.append(f"{slide.title}.")
    if slide.speaker_notes and slide.speaker_notes.strip():
        text_parts.append(slide.speaker_notes.strip())
    elif slide.content and isinstance(slide.content, list):
        text_parts.extend(slide.content)

    full_text = " ".join(text_parts).strip()
    return ElevenLabsService.synthesize_slide_audio(
        lecture_id=lecture_id,
        slide_id=slide_id,
        text=full_text,
        voice_id=voice_id
    )

@router.post("/lectures/{lecture_id}/video-manifest")
def generate_video_lecture_manifest(
    lecture_id: str,
    voice_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
    lecture=Depends(require_lecture_access)
):
    """
    Prepares a full synchronized Video Lecture Manifest for the lecture.
    Ensures comprehensive, masterclass-level pedagogical explanations for every slide,
    and synthesizes neural voice audio with exact continuous chapter timestamps.
    """
    full_lecture = LectureService.get_lecture_with_slides(
        db,
        lecture_id,
        allow_draft=is_course_manager(db, lecture.course_id, user)
    )

    slides_manifest = []
    total_duration = 0.0

    # Retrieve ORM lecture for database updates
    db_lecture = db.scalar(select(Lecture).where(Lecture.id == lecture_id))

    # Phase 1: Prepare slide texts and citations safely on main thread
    slides_data = []
    for slide in full_lecture.slides:
        db_slide = db.scalar(
            select(LectureSlide).where(
                LectureSlide.id == slide.id,
                LectureSlide.lecture_id == lecture_id
            )
        )

        if db_slide and db_lecture:
            full_text = LectureService.ensure_comprehensive_narration(db, db_lecture, db_slide)
        else:
            full_text = slide.speaker_notes or " ".join(slide.content or [slide.title])

        slide_citations = [
            {
                "filename": c.filename,
                "page_number": c.page_number,
                "distance": getattr(c, "distance", None)
            }
            for c in getattr(slide, "citations", [])
        ]
        slides_data.append({
            "slide": slide,
            "db_slide": db_slide,
            "full_text": full_text,
            "citations": slide_citations
        })

    # Phase 2: Parallel synthesis of neural audio and dynamic scene cards
    from concurrent.futures import ThreadPoolExecutor

    def process_slide_assets(item):
        s = item["slide"]
        f_text = item["full_text"]
        a_info = ElevenLabsService.synthesize_slide_audio(
            lecture_id=lecture_id,
            slide_id=s.id,
            text=f_text,
            voice_id=voice_id
        )
        s_cards = LectureService.generate_slide_scene_cards(
            lecture_id=lecture_id,
            slide_id=s.id,
            topic=full_lecture.topic,
            slide_title=s.title,
            slide_number=s.slide_number,
            content=s.content or [],
            narration_script=f_text,
            citations=item["citations"]
        )
        return {
            "slide_id": s.id,
            "audio_info": a_info,
            "scene_cards": s_cards
        }

    max_workers = min(4, len(slides_data) or 1)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        asset_results = list(executor.map(process_slide_assets, slides_data))

    assets_by_id = {res["slide_id"]: res for res in asset_results}

    # Phase 3: Construct sequential continuous manifest with accurate cumulative offsets
    for item in slides_data:
        slide = item["slide"]
        db_slide = item["db_slide"]
        full_text = item["full_text"]
        slide_citations = item["citations"]
        asset = assets_by_id.get(slide.id, {})
        audio_info = asset.get("audio_info", {})
        scene_cards = asset.get("scene_cards", [])

        duration = audio_info.get("duration_seconds", 8.0)
        start_time = round(total_duration, 2)
        end_time = round(total_duration + duration, 2)
        total_duration += duration

        slides_manifest.append({
            "slide_id": slide.id,
            "slide_number": slide.slide_number,
            "title": slide.title,
            "chapter_title": f"Chapter {slide.slide_number}: {slide.title}",
            "content": slide.content or [],
            "speaker_notes": db_slide.speaker_notes if db_slide else (slide.speaker_notes or ""),
            "narration_script": full_text,
            "audio_url": audio_info.get("audio_url"),
            "duration_seconds": duration,
            "subtitles": audio_info.get("cues", []),
            "scene_cards": scene_cards,
            "start_time": start_time,
            "end_time": end_time,
            "source": audio_info.get("source", "neural_speech"),
            "voice": audio_info.get("voice"),
            "citations": slide_citations
        })

    return {
        "lecture_id": full_lecture.id,
        "title": full_lecture.title,
        "topic": full_lecture.topic,
        "course_id": full_lecture.course_id,
        "voice_id": voice_id or "prof-brian-systems",
        "total_slides": len(slides_manifest),
        "total_duration_seconds": round(total_duration, 1),
        "slides": slides_manifest,
        "elevenlabs_configured": ElevenLabsService.is_configured()
    }
