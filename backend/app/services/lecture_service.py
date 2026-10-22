import json
import re
import logging
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, delete

import google.generativeai as genai

from app.models.course import Course
from app.models.lecture import Lecture, LectureSlide
from app.models.citation import Citation
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
    LLMSingleSlideOutput
)
from app.rag.retriever import retrieve_relevant_chunks
from app.config import settings

logger = logging.getLogger(__name__)

def _clean_json_markdown(text: str) -> str:
    """Strip markdown code blocks from LLM JSON response."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text

def _call_gemini(prompt: str) -> str:
    """Call Google Gemini API with fallback models."""
    api_key = settings.GEMINI_API_KEY
    if not api_key or api_key == "your_gemini_api_key_here":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API key is not configured. Set GEMINI_API_KEY in backend/.env."
        )

    genai.configure(api_key=api_key)
    model_names = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-pro"]
    last_error = None

    for model_name in model_names:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            logger.warning(f"Failed to generate content with model '{model_name}': {str(e)}")
            last_error = e

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Gemini LLM generation failed: {str(last_error)}"
    )

def _validate_lecture_quality(lecture: LLMLectureOutput, requested_slide_count: int) -> None:
    """Reject structurally valid but pedagogically weak AI output before it is saved."""
    issues = []
    if len(lecture.slides) != requested_slide_count:
        issues.append(f"expected {requested_slide_count} slides, received {len(lecture.slides)}")
    for index, slide in enumerate(lecture.slides, 1):
        if not slide.cited_chunk_indices:
            issues.append(f"slide {index} has no source citation")
        if not slide.speaker_notes.strip():
            issues.append(f"slide {index} has no presenter notes")
        if len(slide.content) > 4:
            issues.append(f"slide {index} is too dense ({len(slide.content)} bullets)")
    if issues:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI draft did not meet EduForge's lesson-quality checks: " + "; ".join(issues[:3])
        )

class LectureService:
    @staticmethod
    def get_lectures_for_course(db: Session, course_id: str) -> List[LectureSummaryRead]:
        lectures = db.scalars(
            select(Lecture).where(Lecture.course_id == course_id).order_by(Lecture.created_at.desc())
        ).all()

        results = []
        for lec in lectures:
            slide_count = len(lec.slides) if lec.slides else 0
            results.append(
                LectureSummaryRead(
                    id=lec.id,
                    course_id=lec.course_id,
                    title=lec.title,
                    topic=lec.topic,
                    duration_minutes=lec.duration_minutes,
                    difficulty=lec.difficulty,
                    learning_objectives=lec.learning_objectives or [],
                    status=lec.status,
                    slide_count=slide_count,
                    created_at=lec.created_at,
                    updated_at=lec.updated_at
                )
            )
        return results

    @staticmethod
    def get_lecture_with_slides(db: Session, lecture_id: str) -> LectureRead:
        lecture = db.scalar(select(Lecture).where(Lecture.id == lecture_id))
        if not lecture:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture '{lecture_id}' not found.")

        # Load citations for all slides
        slide_ids = [s.id for s in lecture.slides]
        citations = db.scalars(
            select(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id.in_(slide_ids))
        ).all() if slide_ids else []

        citations_by_slide: Dict[str, List[CitationRead]] = {}
        for c in citations:
            citations_by_slide.setdefault(c.entity_id, []).append(CitationRead.model_validate(c))

        slides_read = []
        for s in lecture.slides:
            slides_read.append(
                SlideRead(
                    id=s.id,
                    lecture_id=s.lecture_id,
                    slide_number=s.slide_number,
                    title=s.title,
                    content=s.content or [],
                    speaker_notes=s.speaker_notes or "",
                    citations=citations_by_slide.get(s.id, []),
                    created_at=s.created_at,
                    updated_at=s.updated_at
                )
            )

        return LectureRead(
            id=lecture.id,
            course_id=lecture.course_id,
            title=lecture.title,
            topic=lecture.topic,
            duration_minutes=lecture.duration_minutes,
            difficulty=lecture.difficulty,
            learning_objectives=lecture.learning_objectives or [],
            status=lecture.status,
            additional_instructions=lecture.additional_instructions,
            slides=slides_read,
            created_at=lecture.created_at,
            updated_at=lecture.updated_at
        )

    @staticmethod
    def generate_lecture(db: Session, course_id: str, req: LectureGenerateRequest) -> LectureRead:
        # 1. Verify course exists
        course = db.scalar(select(Course).where(Course.id == course_id))
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course '{course_id}' not found.")

        # 2. Retrieve relevant course chunks
        search_query = f"{req.topic}. {req.additional_instructions or ''}".strip()
        target_k = min(max(req.slide_count * 2, 8), 20)
        retrieved_chunks = retrieve_relevant_chunks(
            question=search_query,
            top_k=target_k,
            course_id=course_id
        )

        # 3. Grounding Guardrail: Refuse generation if insufficient source info
        if not retrieved_chunks:
            logger.warning(f"Insufficient course material chunks found for topic: '{req.topic}' in course '{course_id}'.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient information in the uploaded course materials to generate a grounded lecture on this topic."
            )

        # 4. Format context blocks with 1-based indexing for citation tracking
        context_blocks = []
        for idx, chunk in enumerate(retrieved_chunks, 1):
            meta = chunk.get("metadata", {})
            fname = meta.get("filename") or meta.get("source_filename", "Course Document")
            pnum = meta.get("page_number", "?")
            context_blocks.append(
                f"[Chunk {idx}] (Document: {fname}, Page: {pnum})\n{chunk['text'].strip()}"
            )
        full_context = "\n\n".join(context_blocks)

        # 5. Build strict LLM prompt
        prompt = f"""You are EduForge's master curriculum architect.
Your task is to generate a comprehensive, grounded academic lecture based ONLY on the provided course material chunks. You are designing a teachable learning journey, not filling a slide template.

STRICT GROUNDING RULES:
1. Uploaded course documents are the SOLE source of truth.
2. Do NOT use outside knowledge or hallucinate facts not present in the provided chunks.
3. Every factual slide MUST include the 1-based integer indices of the chunks used in `cited_chunk_indices` (e.g., [1, 2]).
4. If a slide is an introduction or conclusion, cite the main overview chunk(s).
5. Output ONLY a valid JSON object matching the requested schema. No markdown formatting outside of JSON.
6. Build a deliberate arc: orient learners, explain the core idea, develop it with a source-supported example or comparison when available, then consolidate with a recap or check-for-understanding.
7. Give each slide ONE teaching job. Avoid repeating the same definition or using generic filler such as "understand the importance of".
8. Keep slide content presentation-ready: 2–4 short, concrete bullets; use parallel phrasing; put explanation, transitions, and teaching questions in speaker_notes.
9. For every slide, speaker_notes must explain why the slide appears at this point in the lesson and include a useful presenter transition or question.

COURSE CONTEXT CHUNKS:
{full_context}

LECTURE SPECIFICATIONS:
- Topic: {req.topic}
- Target Slide Count: {req.slide_count}
- Target Duration: {req.duration_minutes} minutes
- Target Difficulty: {req.difficulty}
- Additional Instructions: {req.additional_instructions or 'None'}

REQUIRED JSON SCHEMA:
{{
  "title": "Comprehensive Lecture Title",
  "topic": "{req.topic}",
  "learning_objectives": ["Observable learner outcome 1", "Observable learner outcome 2", "Observable learner outcome 3"],
  "slides": [
    {{
      "slide_number": 1,
      "title": "Slide Title",
      "content": ["Concise, source-supported point 1", "Concise, source-supported point 2", "Concise, source-supported point 3"],
      "speaker_notes": "Why this slide matters, how to explain it, and a transition or question for learners...",
      "cited_chunk_indices": [1]
    }}
  ]
}}
"""

        # 6. Invoke Gemini and validate structured output
        raw_output = _call_gemini(prompt)
        cleaned_json = _clean_json_markdown(raw_output)

        try:
            parsed_data = json.loads(cleaned_json)
            validated_lecture = LLMLectureOutput.model_validate(parsed_data)
        except Exception as e:
            logger.error(f"Failed to validate LLM lecture output: {str(e)}\nRaw was: {raw_output[:500]}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to generate structured lecture from AI: {str(e)}"
            )

        if not validated_lecture.slides:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI generated an empty slide list."
            )

        _validate_lecture_quality(validated_lecture, req.slide_count)

        # 7. Persist Lecture, Slides, and Citations
        db_lecture = Lecture(
            course_id=course_id,
            title=validated_lecture.title,
            topic=validated_lecture.topic,
            duration_minutes=req.duration_minutes,
            difficulty=req.difficulty,
            learning_objectives=validated_lecture.learning_objectives,
            status="draft",
            additional_instructions=req.additional_instructions
        )
        db.add(db_lecture)
        db.flush()

        for s_idx, slide_data in enumerate(validated_lecture.slides, 1):
            db_slide = LectureSlide(
                lecture_id=db_lecture.id,
                slide_number=s_idx,
                title=slide_data.title,
                content=slide_data.content,
                speaker_notes=slide_data.speaker_notes or ""
            )
            db.add(db_slide)
            db.flush()

            # Map valid chunk indices to real citations
            added_citations = set()
            for c_idx in slide_data.cited_chunk_indices:
                if 1 <= c_idx <= len(retrieved_chunks):
                    chunk = retrieved_chunks[c_idx - 1]
                    meta = chunk.get("metadata", {})
                    doc_id = meta.get("document_id") or meta.get("doc_id")
                    fname = meta.get("filename") or meta.get("source_filename", "Course Document")
                    pnum = meta.get("page_number")
                    chunk_id = chunk.get("id")

                    sig = (fname, pnum, chunk_id)
                    if sig not in added_citations:
                        added_citations.add(sig)
                        db_citation = Citation(
                            entity_type="lecture_slide",
                            entity_id=db_slide.id,
                            document_id=doc_id,
                            chunk_id=chunk_id,
                            page_number=pnum,
                            filename=fname,
                            distance=chunk.get("distance"),
                            chunk_text=chunk.get("text")
                        )
                        db.add(db_citation)

        db.commit()
        db.refresh(db_lecture)
        logger.info(f"Lecture '{db_lecture.title}' generated and saved successfully (ID: {db_lecture.id}, {len(validated_lecture.slides)} slides).")

        return LectureService.get_lecture_with_slides(db, db_lecture.id)

    @staticmethod
    def update_lecture(db: Session, lecture_id: str, update_in: LectureUpdate) -> LectureRead:
        lecture = db.scalar(select(Lecture).where(Lecture.id == lecture_id))
        if not lecture:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture '{lecture_id}' not found.")

        if update_in.title is not None:
            lecture.title = update_in.title.strip()
        if update_in.topic is not None:
            lecture.topic = update_in.topic.strip()
        if update_in.duration_minutes is not None:
            lecture.duration_minutes = update_in.duration_minutes
        if update_in.difficulty is not None:
            lecture.difficulty = update_in.difficulty
        if update_in.learning_objectives is not None:
            lecture.learning_objectives = update_in.learning_objectives
        if update_in.status is not None:
            lecture.status = update_in.status
        if update_in.additional_instructions is not None:
            lecture.additional_instructions = update_in.additional_instructions

        db.commit()
        return LectureService.get_lecture_with_slides(db, lecture_id)

    @staticmethod
    def delete_lecture(db: Session, lecture_id: str) -> None:
        lecture = db.scalar(select(Lecture).where(Lecture.id == lecture_id))
        if not lecture:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture '{lecture_id}' not found.")

        # Delete slide citations
        slide_ids = [s.id for s in lecture.slides]
        if slide_ids:
            db.execute(
                delete(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id.in_(slide_ids))
            )

        db.delete(lecture)
        db.commit()
        logger.info(f"Deleted lecture: {lecture_id}")

    @staticmethod
    def update_slide(db: Session, lecture_id: str, slide_id: str, slide_in: SlideUpdate) -> SlideRead:
        slide = db.scalar(
            select(LectureSlide).where(LectureSlide.id == slide_id, LectureSlide.lecture_id == lecture_id)
        )
        if not slide:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Slide '{slide_id}' not found in lecture '{lecture_id}'.")

        if slide_in.title is not None:
            slide.title = slide_in.title.strip()
        if slide_in.content is not None:
            slide.content = slide_in.content
        if slide_in.speaker_notes is not None:
            slide.speaker_notes = slide_in.speaker_notes

        db.commit()
        db.refresh(slide)

        citations = db.scalars(
            select(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id == slide.id)
        ).all()

        return SlideRead(
            id=slide.id,
            lecture_id=slide.lecture_id,
            slide_number=slide.slide_number,
            title=slide.title,
            content=slide.content or [],
            speaker_notes=slide.speaker_notes or "",
            citations=[CitationRead.model_validate(c) for c in citations],
            created_at=slide.created_at,
            updated_at=slide.updated_at
        )

    @staticmethod
    def delete_slide(db: Session, lecture_id: str, slide_id: str) -> None:
        slide = db.scalar(
            select(LectureSlide).where(LectureSlide.id == slide_id, LectureSlide.lecture_id == lecture_id)
        )
        if not slide:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Slide '{slide_id}' not found.")

        # Delete citations for this slide
        db.execute(
            delete(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id == slide_id)
        )
        db.delete(slide)
        db.commit()

        # Renumber remaining slides
        remaining_slides = db.scalars(
            select(LectureSlide).where(LectureSlide.lecture_id == lecture_id).order_by(LectureSlide.slide_number)
        ).all()
        for idx, s in enumerate(remaining_slides, 1):
            s.slide_number = idx
        db.commit()
        logger.info(f"Deleted slide '{slide_id}' and renumbered remaining slides in lecture '{lecture_id}'.")

    @staticmethod
    def regenerate_slide(db: Session, lecture_id: str, slide_id: str, req: SlideRegenerateRequest) -> SlideRead:
        slide = db.scalar(
            select(LectureSlide).where(LectureSlide.id == slide_id, LectureSlide.lecture_id == lecture_id)
        )
        if not slide:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Slide '{slide_id}' not found.")

        lecture = slide.lecture

        # Retrieve relevant chunks for slide improvement query
        retrieval_query = f"{slide.title}. {req.instruction}"
        retrieved_chunks = retrieve_relevant_chunks(
            question=retrieval_query,
            top_k=6,
            course_id=lecture.course_id
        )

        if not retrieved_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient information in the uploaded course materials to regenerate this slide with the requested instruction."
            )

        context_blocks = []
        for idx, chunk in enumerate(retrieved_chunks, 1):
            meta = chunk.get("metadata", {})
            fname = meta.get("filename") or meta.get("source_filename", "Course Document")
            pnum = meta.get("page_number", "?")
            context_blocks.append(f"[Chunk {idx}] (Document: {fname}, Page: {pnum})\n{chunk['text'].strip()}")
        full_context = "\n\n".join(context_blocks)

        prompt = f"""You are EduForge's master curriculum architect.
Your task is to regenerate and improve a SINGLE slide in an academic lecture based ONLY on the provided course material chunks.

STRICT GROUNDING RULES:
1. ONLY use information from the provided context chunks.
2. In `cited_chunk_indices`, include the 1-based indices of chunks used.
3. Output ONLY a valid JSON object matching the requested schema.
4. Improve the slide as a teaching artifact: give it one clear teaching job, use 2–4 concise non-repetitive bullets, and use speaker notes for explanation and a presenter transition or question.

COURSE CONTEXT CHUNKS:
{full_context}

ORIGINAL SLIDE:
Title: {slide.title}
Content: {slide.content}
Speaker Notes: {slide.speaker_notes}

USER IMPROVEMENT INSTRUCTION:
{req.instruction}

REQUIRED JSON SCHEMA:
{{
  "title": "Improved Slide Title",
  "content": [
    "Improved bullet point 1",
    "Improved bullet point 2",
    "Improved bullet point 3"
  ],
  "speaker_notes": "Improved presenter narrative notes...",
  "cited_chunk_indices": [1]
}}
"""

        raw_output = _call_gemini(prompt)
        cleaned_json = _clean_json_markdown(raw_output)

        try:
            parsed_data = json.loads(cleaned_json)
            validated_slide = LLMSingleSlideOutput.model_validate(parsed_data)
        except Exception as e:
            logger.error(f"Failed to validate regenerated slide output: {str(e)}\nRaw was: {raw_output[:500]}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to parse regenerated slide from AI: {str(e)}"
            )

        # Delete old citations for this slide
        db.execute(
            delete(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id == slide.id)
        )

        # Update slide content
        slide.title = validated_slide.title
        slide.content = validated_slide.content
        slide.speaker_notes = validated_slide.speaker_notes or ""

        # Insert new citations
        added_citations = set()
        for c_idx in validated_slide.cited_chunk_indices:
            if 1 <= c_idx <= len(retrieved_chunks):
                chunk = retrieved_chunks[c_idx - 1]
                meta = chunk.get("metadata", {})
                doc_id = meta.get("document_id") or meta.get("doc_id")
                fname = meta.get("filename") or meta.get("source_filename", "Course Document")
                pnum = meta.get("page_number")
                chunk_id = chunk.get("id")

                sig = (fname, pnum, chunk_id)
                if sig not in added_citations:
                    added_citations.add(sig)
                    db_citation = Citation(
                        entity_type="lecture_slide",
                        entity_id=slide.id,
                        document_id=doc_id,
                        chunk_id=chunk_id,
                        page_number=pnum,
                        filename=fname,
                        distance=chunk.get("distance"),
                        chunk_text=chunk.get("text")
                    )
                    db.add(db_citation)

        db.commit()
        db.refresh(slide)

        new_citations = db.scalars(
            select(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id == slide.id)
        ).all()

        return SlideRead(
            id=slide.id,
            lecture_id=slide.lecture_id,
            slide_number=slide.slide_number,
            title=slide.title,
            content=slide.content or [],
            speaker_notes=slide.speaker_notes or "",
            citations=[CitationRead.model_validate(c) for c in new_citations],
            created_at=slide.created_at,
            updated_at=slide.updated_at
        )
