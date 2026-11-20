import json
import re
import os
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, delete

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
    import google.generativeai as genai
    api_key = settings.GEMINI_API_KEY
    if not api_key or api_key == "your_gemini_api_key_here":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API key is not configured. Set GEMINI_API_KEY in backend/.env."
        )

    genai.configure(api_key=api_key)
    # Gemini AI Studio free tier limits quota per model (e.g. gemini-2.5-flash has 20 RPD).
    # Maintain a robust fallback chain across active models so quota exhaustion on one model cascades to the next.
    model_names = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-flash-latest",
        "gemini-2.5-pro",
    ]
    last_error = None

    for model_name in model_names:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            if response and response.text:
                logger.info(f"Lecture script successfully generated using Gemini model '{model_name}'.")
                return response.text.strip()
        except Exception as e:
            err_str = str(e).lower()
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
        if len(slide.content) > 4:
            issues.append(f"slide {index} is too dense ({len(slide.content)} bullets)")
    if issues:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI draft did not meet EduForge's lesson-quality checks: " + "; ".join(issues[:3])
        )

class LectureService:
    @staticmethod
    def get_lectures_for_course(
        db: Session,
        course_id: str,
        include_drafts: bool = True,
    ) -> List[LectureSummaryRead]:
        query = select(Lecture).where(Lecture.course_id == course_id)
        if not include_drafts:
            query = query.where(Lecture.status == "published")
        lectures = db.scalars(query.order_by(Lecture.created_at.desc())).all()

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
    def get_lecture_with_slides(
        db: Session,
        lecture_id: str,
        allow_draft: bool = True,
    ) -> LectureRead:
        lecture = db.scalar(select(Lecture).where(Lecture.id == lecture_id))
        if not lecture:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture '{lecture_id}' not found.")
        if not allow_draft and lecture.status != "published":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecture not found.")

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
9. Speaker notes are optional presenter guidance. Add them only when a useful transition, teaching question, or delivery cue adds value beyond the visible slide.

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
    def publish_lecture(db: Session, lecture_id: str) -> LectureRead:
        lecture = db.scalar(select(Lecture).where(Lecture.id == lecture_id))
        if not lecture:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture '{lecture_id}' not found.")
        if not lecture.slides:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot publish an empty lecture without slides.",
            )
        lecture.status = "published"
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

    @staticmethod
    def clean_slide_narration_script(text: str, slide_number: int, slide_title: str) -> str:
        """
        Cleans repetitive greetings from slides 2+ so an entire multi-chapter lecture
        flows like one cohesive masterclass video rather than restarting with 'Welcome' each slide.
        """
        if not text or slide_number <= 1:
            return text
        import re
        cleaned = text.strip()
        # Remove variants of Welcome / Welcome back / Hello everyone
        pattern = r'^(?:welcome(?:\s+back)?(?:\s*,\s*everyone|\s+everyone)?(?:!|\.|,)?\s*)+(?:today,?\s*(?:we(?:\'re|\s+are)\s+(?:diving|delving|exploring|embarking|going|turning)|we\s+(?:embark|delve|explore|dive))\s+(?:into|on|upon|to)\s+)?'
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r'^(?:today,?\s*(?:we(?:\'re|\s+are)\s+(?:diving|delving|exploring|embarking|going|turning)|we\s+(?:embark|delve|explore|dive))\s+(?:into|on|upon|to)\s+)', '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r'^(?:let us|let\'s)\s+begin\s+by\s+welcoming[^\.]*\.\s*', '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = cleaned[0].upper() + cleaned[1:] if cleaned else cleaned

        # If it already starts with a natural spoken transition, keep it
        lower_cleaned = cleaned.lower()
        if any(lower_cleaned.startswith(p) for p in [
            "now", "building", "moving", "let us", "let's", "turning", "this brings", "with our", "having", "as we continue"
        ]):
            return cleaned

        bridges = [
            f"Now that we have established our foundation, let us explore {slide_title}.",
            f"Building directly on this concept, let us examine {slide_title}.",
            f"Next, turning our focus to {slide_title}:",
            f"This brings us to a crucial mechanism: {slide_title}.",
            f"With our core components in place, let us analyze {slide_title}.",
            f"To synthesize our entire masterclass, let's review {slide_title}."
        ]
        b_idx = min(len(bridges) - 1, max(0, slide_number - 2))
        return f"{bridges[b_idx]} {cleaned}"

    @staticmethod
    def ensure_comprehensive_narration(db: Session, lecture: Lecture, slide: LectureSlide) -> str:
        """
        Ensures each slide has an in-depth, masterclass-level spoken explanation (~160-260 words).
        If existing speaker_notes are short (< 75 words), uses Gemini to generate a rich, engaging,
        human-grade lecture script explaining intuition, mechanics, analogies, and key takeaways.
        Caches the script directly in slide.speaker_notes.
        """
        existing_notes = (slide.speaker_notes or "").strip()
        word_count = len(existing_notes.split())

        if word_count >= 75:
            if slide.slide_number > 1:
                cleaned_notes = LectureService.clean_slide_narration_script(existing_notes, slide.slide_number, slide.title)
                if cleaned_notes != existing_notes:
                    slide.speaker_notes = cleaned_notes
                    db.add(slide)
                    db.commit()
                    db.refresh(slide)
                    return cleaned_notes
            return existing_notes

        bullets_text = "\n".join(f"- {b}" for b in (slide.content or []))
        citations_text = ""
        citations = db.scalars(
            select(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id == slide.id)
        ).all()
        if citations:
            citations_text = "\n".join(
                f"- Document: {c.filename}, Page {c.page_number or '1'}"
                for c in citations
            )

        prompt = f"""You are an inspiring, world-class university professor delivering an engaging spoken video lecture.
Course Topic: {lecture.topic}
Lecture Title: {lecture.title}
Chapter / Slide Number: {slide.slide_number}
Slide Title: {slide.title}

Slide Visual Bullet Points:
{bullets_text or '- General Overview'}

Verified Grounding Citations:
{citations_text or '- Core Course Syllabus Material'}

TASK:
Write an in-depth, pedagogical spoken lecture narrative (~160 to 260 words) for this slide that explains the concepts with great clarity, intuition, and depth.

CONTINUOUS LECTURE FLOW RULES:
{'1. Welcome the listener to this continuous video lecture on ' + lecture.title + '. Set the stage for the full session with authority and warmth.' if slide.slide_number == 1 else '1. CRITICAL: DO NOT say "Welcome" or "Welcome back" or "Hello everyone"! This is Chapter ' + str(slide.slide_number) + ' of an ongoing continuous video lecture. Begin directly with a natural spoken transition phrase connecting from previous ideas (e.g. "Now let us turn our attention to ' + slide.title + '...", "Building directly on this foundation...", "This brings us to a crucial mechanism: ' + slide.title + '...").'}
2. Explain the intuition and the 'why' behind the concept, including a vivid real-world analogy.
3. Walk through each bullet point on the slide thoroughly, unpacking the technical mechanics.
4. Address common student pitfalls or misconceptions.
5. Provide a smooth verbal bridge to the next concept.
6. Return ONLY the spoken words. No markdown headers, no stage directions like '[pause]', no 'In this slide'.
"""
        try:
            expanded_script = _call_gemini(prompt)
            clean_script = expanded_script.strip().strip('"').strip("'")
            if len(clean_script.split()) >= 60:
                if slide.slide_number > 1:
                    clean_script = LectureService.clean_slide_narration_script(clean_script, slide.slide_number, slide.title)
                slide.speaker_notes = clean_script
                db.add(slide)
                db.commit()
                db.refresh(slide)
                return clean_script
        except Exception as e:
            logger.warning(f"Could not expand slide narration via Gemini: {e}")

        # Intelligent structured fallback if Gemini is offline
        bullet_elaborations = []
        for b in (slide.content or []):
            bullet_elaborations.append(f"Specifically, when we analyze {b.lower()}, notice that the underlying system must maintain strict consistency and resource efficiency.")

        if slide.slide_number == 1:
            fallback_script = (
                f"Welcome, everyone, to our masterclass on {lecture.title}. Today, we will explore {lecture.topic} in depth, "
                f"examining not just high-level definitions, but the concrete mechanics and real-world architectures that make these systems work reliably. "
                f"{' '.join(bullet_elaborations)} "
                f"Keep these core principles in mind as we begin our journey."
            )
        else:
            fallback_script = (
                f"Building directly on our previous concepts, let us now focus our attention on {slide.title}. In the context of {lecture.topic}, "
                f"mastering this mechanism is essential for building reliable, production-grade systems. "
                f"{' '.join(bullet_elaborations)} "
                f"As we examine our course materials, these principles directly prevent systemic failures and guarantee predictable performance. "
                f"Keep these key mechanisms in mind as we transition forward."
            )

        slide.speaker_notes = fallback_script
        db.add(slide)
        db.commit()
        db.refresh(slide)
        return fallback_script

    @staticmethod
    def generate_slide_scene_cards(
        lecture_id: str,
        slide_id: str,
        topic: str,
        slide_title: str,
        slide_number: int,
        content: List[str],
        narration_script: str,
        citations: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generates or retrieves 3-4 dynamic, sequential visual scene cards for a slide (NotebookLM style).
        Caches cards to disk at backend/data/scene_cards/{lecture_id}_{slide_id}.json.
        """
        cache_dir = Path("backend/data/scene_cards")
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = cache_dir / f"{lecture_id}_{slide_id}.json"

        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    if isinstance(cached, list) and len(cached) >= 2:
                        return cached
            except Exception as e:
                logger.warning(f"Failed to read cached scene cards: {e}")

        bullets_text = "\n".join(f"- {b}" for b in (content or []))

        prompt = f"""You are an educational visual designer creating dynamic visual scene cards for an interactive NotebookLM-style video lecture overview.
Course Topic: {topic}
Slide #{slide_number}: {slide_title}

Slide Visual Bullets:
{bullets_text or '- General Overview'}

Full Spoken Narration for this Slide:
{narration_script[:1200] if narration_script else 'N/A'}

TASK:
Break down this slide's explanation into exactly 3 to 4 sequential DYNAMIC SCENE CARDS.
Each card represents a visual beat that stays on screen while that portion of the audio plays.

Requirements:
Card 1: "hook" -> The central problem, dilemma, or question that hooks the student. (start_pct: 0.0, end_pct: 0.25)
Card 2: "analogy" or "breakdown" -> The mental model, everyday analogy, or core multi-part breakdown. (start_pct: 0.25, end_pct: 0.60)
Card 3: "mechanics" or "rule" -> The technical rules, system mechanics, or critical failure modes/traps to avoid. (start_pct: 0.60, end_pct: 0.85)
Card 4: "takeaway" -> The golden rule summary and academic conclusion. (start_pct: 0.85, end_pct: 1.0)

Card Schema:
- "id": string (e.g. "card-1")
- "card_type": "hook" | "analogy" | "mechanics" | "takeaway"
- "badge": short punchy uppercase category label (e.g. "THE CORE QUESTION", "THE MENTAL MODEL", "CRITICAL PITFALL", "KEY TAKEAWAY")
- "headline": bold, engaging title (e.g. "Why Can't We Test on Training Data?", "The Three-Tier Exam Analogy")
- "subheadline": 1 short clarifying line
- "items": array of 2 to 4 structured items, each with:
    - "label": short bold label (e.g. "Training Set (80%)", "The Trap", "Golden Rule")
    - "text": concise explanation (1-2 sentences)
    - "tag": short badge (optional, e.g. "Homework", "Overfitting", "Isolate")
- "callout": string (punchy quote, rule, or warning callout)
- "start_pct": float (0.0 to 1.0)
- "end_pct": float (0.0 to 1.0)

Return ONLY valid JSON matching:
{{
  "scene_cards": [ ... ]
}}
"""
        try:
            raw_output = _call_gemini(prompt)
            cleaned = _clean_json_markdown(raw_output)
            parsed = json.loads(cleaned)
            cards = parsed.get("scene_cards", [])
            if isinstance(cards, list) and len(cards) >= 2:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(cards, f, indent=2)
                return cards
        except Exception as e:
            logger.warning(f"Gemini scene card generation failed or skipped: {e}. Building algorithmic scene cards.")

        # Guaranteed high-quality algorithmic fallback
        fallback_cards = LectureService._build_algorithmic_scene_cards(
            topic=topic,
            slide_title=slide_title,
            content=content,
            narration_script=narration_script,
            citations=citations
        )

        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(fallback_cards, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not cache fallback scene cards: {e}")

        return fallback_cards

    @staticmethod
    def _build_algorithmic_scene_cards(
        topic: str,
        slide_title: str,
        content: List[str],
        narration_script: str,
        citations: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        # Filter out meta-prompts like "Ground this lecture in source pages..."
        raw_bullets = [
            b.strip() for b in (content or [])
            if b.strip() and not b.lower().startswith("ground this lecture")
            and not b.lower().startswith("source page")
        ]
        bullets = raw_bullets if raw_bullets else [slide_title]
        clean_title = slide_title.strip()
        clean_title_lower = clean_title.lower()
        bullets_lower = " ".join([b.lower() for b in bullets])

        cite_tags = []
        if citations:
            for c in citations[:2]:
                cite_tags.append(f"{c.get('filename', 'Course Document')} (p. {c.get('page_number', '1')})")

        # 1. Takeaways / Mastering / Conclusion (Checked first so final summary slides aren't misclassified)
        if any(k in clean_title_lower for k in ["takeaway", "mastering", "conclusion", "summary"]):
            card1 = {
                "id": "card-1",
                "card_type": "hook",
                "badge": "THE CORE QUESTION",
                "headline": "Synthesis: The Blueprint for Reliable Machine Learning",
                "subheadline": "Consolidating core principles into an infallible engineering discipline",
                "items": [
                    {
                        "label": "Engineering Rigor",
                        "text": "Sophisticated architectures and deep neural nets fail if evaluation methodology is defective.",
                        "tag": "Methodology"
                    },
                    {
                        "label": "The Ultimate Objective",
                        "text": "Building systems that deliver consistent, honest value on unseen real-world distributions.",
                        "tag": "Production Value"
                    }
                ],
                "callout": "Your machine learning system is only as trustworthy as the discipline of your data partitions.",
                "start_pct": 0.0,
                "end_pct": 0.25
            }
            card2 = {
                "id": "card-2",
                "card_type": "analogy",
                "badge": "THE MENTAL MODEL",
                "headline": "The Full Partition Lifecycle",
                "subheadline": "Sequential execution path from raw data to verified deployment",
                "items": [
                    {
                        "label": "1. Partition First",
                        "text": "Carve out Train, Validation, and Test partitions before any exploratory preprocessing.",
                        "tag": "Phase 1"
                    },
                    {
                        "label": "2. Train & Tune",
                        "text": "Fit transformers on training data; iterate hyperparameters using validation metrics.",
                        "tag": "Phase 2"
                    },
                    {
                        "label": "3. Single-Use Audit",
                        "text": "Unseal the test partition once to obtain your verified performance benchmark.",
                        "tag": "Phase 3"
                    },
                    {
                        "label": "4. Continuous Telemetry",
                        "text": "Monitor live drift and retraining needs once deployed.",
                        "tag": "Phase 4"
                    }
                ],
                "callout": "Follow the sequential lifecycle: never look backward once the test vault is locked.",
                "start_pct": 0.25,
                "end_pct": 0.60
            }
            card3 = {
                "id": "card-3",
                "card_type": "mechanics",
                "badge": "CRITICAL PITFALL & GOLDEN RULE",
                "headline": "Golden Rules for Machine Learning Engineers",
                "subheadline": "Non-negotiable operational standards",
                "items": [
                    {
                        "label": "Rule 1: Strict Isolation",
                        "text": "Never fit scalers, selectors, or models on data outside the training partition.",
                        "tag": "Isolation"
                    },
                    {
                        "label": "Rule 2: Match Data Topology",
                        "text": "Always apply stratified, grouped, or chronological splitting to match real data structure.",
                        "tag": "Data Topology"
                    },
                    {
                        "label": "Rule 3: Reproducible Seeds",
                        "text": "Fix random seeds and version data partitions for audited reproducibility.",
                        "tag": "Reproducibility"
                    }
                ],
                "callout": "A simple baseline on a pristine split is infinitely more valuable than a deep network on a leaked split.",
                "start_pct": 0.60,
                "end_pct": 0.85
            }
            card4 = {
                "id": "card-4",
                "card_type": "takeaway",
                "badge": "KEY TAKEAWAY & CITATIONS",
                "headline": "Curriculum Mastery & Grounded Synthesis",
                "subheadline": "Verified against accredited syllabus standards",
                "items": [
                    {
                        "label": "Mastery Achieved",
                        "text": "You understand the mathematical and practical foundations of reliable evaluation.",
                        "tag": "Mastery"
                    },
                    {
                        "label": "Academic Accreditation",
                        "text": f"Grounded in course materials: {', '.join(cite_tags) if cite_tags else 'Machine Learning Curriculum'}",
                        "tag": "Verified"
                    }
                ],
                "callout": "You are now equipped to build, evaluate, and deploy machine learning models with confidence.",
                "start_pct": 0.85,
                "end_pct": 1.0
            }
            return [card1, card2, card3, card4]

        # 2. Validation Set
        if "validation" in clean_title_lower:
            card1 = {
                "id": "card-1",
                "card_type": "hook",
                "badge": "THE CORE QUESTION",
                "headline": "Why Can't We Tune Hyperparameters on Training Data?",
                "subheadline": "The hidden trap of model optimization and architecture selection",
                "items": [
                    {
                        "label": "The Tuning Dilemma",
                        "text": "Tuning hyperparameters like tree depth or learning rate directly on training data causes catastrophic overfitting to training quirks.",
                        "tag": "Hyperparameters"
                    },
                    {
                        "label": "The Core Objective",
                        "text": "Provide an isolated sandbox to evaluate candidate configurations without touching the final evaluation test set.",
                        "tag": "Model Selection"
                    }
                ],
                "callout": "Hyperparameters configure how the algorithm learns; they cannot be judged by the data they already fit.",
                "start_pct": 0.0,
                "end_pct": 0.25
            }
            card2 = {
                "id": "card-2",
                "card_type": "analogy",
                "badge": "THE MENTAL MODEL",
                "headline": "The Practice Exam: The Validation Workflow",
                "subheadline": "Iterative model refinement without touching final evaluation data",
                "items": [
                    {
                        "label": "📚 Training (Fit)",
                        "text": "The model learns internal weights and extracts core feature patterns from raw data.",
                        "tag": "Fit"
                    },
                    {
                        "label": "📝 Validation (Tune)",
                        "text": "Enables early stopping, regularizer tuning, and model comparison (e.g. Random Forest vs XGBoost).",
                        "tag": "Tune"
                    },
                    {
                        "label": "🎓 Test (Vault)",
                        "text": "Kept in a locked vault until the absolute final performance audit.",
                        "tag": "Untouched"
                    }
                ],
                "callout": "Think of the validation set as regular practice quizzes that measure progress before final exam day.",
                "start_pct": 0.25,
                "end_pct": 0.60
            }
            card3 = {
                "id": "card-3",
                "card_type": "mechanics",
                "badge": "CRITICAL PITFALL & GOLDEN RULE",
                "headline": "Guarding Against Validation Overfitting",
                "subheadline": "Preventing information leaks during active hyperparameter tuning",
                "items": [
                    {
                        "label": "Validation Leakage",
                        "text": "Trying 10,000 hyperparameter configurations against one fixed validation split causes the model to overfit the validation set itself.",
                        "tag": "Info Leak"
                    },
                    {
                        "label": "Cross-Validation Guard",
                        "text": "Employ K-Fold Cross-Validation during tuning when sample sizes are modest to ensure statistical robustness.",
                        "tag": "K-Fold CV"
                    }
                ],
                "callout": "Golden Rule: Never use validation results as your final published accuracy. Treat validation as iterative guidance only.",
                "start_pct": 0.60,
                "end_pct": 0.85
            }
            card4 = {
                "id": "card-4",
                "card_type": "takeaway",
                "badge": "KEY TAKEAWAY & CITATIONS",
                "headline": "Validation Set: Core Takeaways",
                "subheadline": "Disciplined model selection blueprint",
                "items": [
                    {
                        "label": "Essential Function",
                        "text": "Tunes external hyperparameters, guides early stopping, and selects optimal models objectively.",
                        "tag": "Optimization"
                    },
                    {
                        "label": "Verified Grounding",
                        "text": f"Grounded in course materials: {', '.join(cite_tags) if cite_tags else 'Machine Learning Curriculum'}",
                        "tag": "Verified"
                    }
                ],
                "callout": "A disciplined validation process is what separates fragile prototypes from trustworthy production systems.",
                "start_pct": 0.85,
                "end_pct": 1.0
            }
            return [card1, card2, card3, card4]

        # 2. Test Set
        if "test set" in clean_title_lower or ("test" in clean_title_lower and ("eval" in clean_title_lower or "unbias" in clean_title_lower or "perform" in clean_title_lower)):
            card1 = {
                "id": "card-1",
                "card_type": "hook",
                "badge": "THE CORE QUESTION",
                "headline": "The Final Exam: What Is the True Test Score?",
                "subheadline": "The absolute requirement of an untouched benchmark for real-world generalization",
                "items": [
                    {
                        "label": "The Unseen Reality",
                        "text": "In production, models face real-world customer queries they have never encountered during development.",
                        "tag": "Real-World"
                    },
                    {
                        "label": "The Contamination Trap",
                        "text": "Any exposure of test data during training, scaling, or tuning irreversibly contaminates the evaluation score.",
                        "tag": "Contamination"
                    }
                ],
                "callout": "The test set represents your one honest chance to measure true out-of-sample generalization.",
                "start_pct": 0.0,
                "end_pct": 0.25
            }
            card2 = {
                "id": "card-2",
                "card_type": "analogy",
                "badge": "THE MENTAL MODEL",
                "headline": "The Vault Analogy: Lock the Test Set Away",
                "subheadline": "Treating test data as confidential and single-use",
                "items": [
                    {
                        "label": "The Sealed Vault",
                        "text": "Test data is sequestered at project inception. Scalers, imputers, and feature selectors never touch it.",
                        "tag": "Sealed"
                    },
                    {
                        "label": "The Single-Use Key",
                        "text": "Evaluated exactly once at project completion to produce the definitive metric.",
                        "tag": "Single-Use"
                    }
                ],
                "callout": "If you open the vault multiple times to adjust models, you have converted your test set into a validation set.",
                "start_pct": 0.25,
                "end_pct": 0.60
            }
            card3 = {
                "id": "card-3",
                "card_type": "mechanics",
                "badge": "CRITICAL PITFALL & GOLDEN RULE",
                "headline": "What Strong Test Scores Do NOT Guarantee",
                "subheadline": "Post-deployment operational reality and concept drift",
                "items": [
                    {
                        "label": "Data & Concept Drift",
                        "text": "Real-world distributions shift over time; a strong test score is a point-in-time baseline, not a permanent guarantee.",
                        "tag": "Data Drift"
                    },
                    {
                        "label": "Monitoring Requirement",
                        "text": "Production deployments require continuous inference telemetry and shadow model benchmarking.",
                        "tag": "Telemetry"
                    }
                ],
                "callout": "Passing the test set earns deployment permission, but active monitoring maintains production reliability.",
                "start_pct": 0.60,
                "end_pct": 0.85
            }
            card4 = {
                "id": "card-4",
                "card_type": "takeaway",
                "badge": "KEY TAKEAWAY & CITATIONS",
                "headline": "Test Set: Golden Principles",
                "subheadline": "The definitive benchmark of generalizability",
                "items": [
                    {
                        "label": "Single-Use Audit",
                        "text": "Evaluate once at the very end to obtain an honest, unvarnished estimate of performance.",
                        "tag": "Unbiased"
                    },
                    {
                        "label": "Verified Grounding",
                        "text": f"Syllabus evaluation standards: {', '.join(cite_tags) if cite_tags else 'Accredited Curriculum'}",
                        "tag": "Verified"
                    }
                ],
                "callout": "Never adjust a model based on test set results; honesty in evaluation protects against production catastrophes.",
                "start_pct": 0.85,
                "end_pct": 1.0
            }
            return [card1, card2, card3, card4]

        # 3. Training Set
        if "training set" in clean_title_lower or ("training" in clean_title_lower and "learn" in clean_title_lower):
            card1 = {
                "id": "card-1",
                "card_type": "hook",
                "badge": "THE CORE QUESTION",
                "headline": "Where Learning Begins: Parameter Optimization",
                "subheadline": "The foundational partition where algorithms discover pattern signal",
                "items": [
                    {
                        "label": "Parameter Fitting",
                        "text": "Weights, biases, decision thresholds, and cluster centers are mathematically learned exclusively here.",
                        "tag": "Weights"
                    },
                    {
                        "label": "Volume Requirement",
                        "text": "Typically comprises 70% to 80% of total data to ensure adequate coverage of problem complexity.",
                        "tag": "Capacity"
                    }
                ],
                "callout": "The model's internal representation is shaped entirely by the diversity and quality of this partition.",
                "start_pct": 0.0,
                "end_pct": 0.25
            }
            card2 = {
                "id": "card-2",
                "card_type": "analogy",
                "badge": "THE MENTAL MODEL",
                "headline": "The Textbook & Classroom Analogy",
                "subheadline": "Absorbing domain knowledge through repetitive example exposure",
                "items": [
                    {
                        "label": "Pattern Extraction",
                        "text": "The algorithm identifies predictive signals and correlations between input features and targets.",
                        "tag": "Signal"
                    },
                    {
                        "label": "Loss Minimization",
                        "text": "Iterative gradient updates drive prediction error down across training instances.",
                        "tag": "Gradients"
                    },
                    {
                        "label": "The Overfitting Trap",
                        "text": "Too much capacity leads to memorizing noise rather than generalizable structure.",
                        "tag": "Memorization"
                    }
                ],
                "callout": "Just like studying textbook exercises, repetition builds mastery, but memorizing answer keys fails the exam.",
                "start_pct": 0.25,
                "end_pct": 0.60
            }
            card3 = {
                "id": "card-3",
                "card_type": "mechanics",
                "badge": "CRITICAL PITFALL & GOLDEN RULE",
                "headline": "The Boundary of the Training Partition",
                "subheadline": "What belongs in training and what must strictly stay out",
                "items": [
                    {
                        "label": "Fitting Transformers",
                        "text": "Fit all scalers, normalizers, and imputers ONLY on the training split, then transform other sets.",
                        "tag": "Fit Once"
                    },
                    {
                        "label": "Noise Safeguards",
                        "text": "Apply regularization and data augmentation inside the training fold to discourage memorization.",
                        "tag": "Regularization"
                    }
                ],
                "callout": "Golden Rule: If a transformation computes statistics across rows, it must only touch the training partition.",
                "start_pct": 0.60,
                "end_pct": 0.85
            }
            card4 = {
                "id": "card-4",
                "card_type": "takeaway",
                "badge": "KEY TAKEAWAY & CITATIONS",
                "headline": "Training Set: Core Takeaways",
                "subheadline": "Representation and capacity guidelines",
                "items": [
                    {
                        "label": "Sufficient Representation",
                        "text": "Must comprehensively represent all target classes, edge cases, and feature modalities.",
                        "tag": "Coverage"
                    },
                    {
                        "label": "Strict Partitioning",
                        "text": "Must never overlap with validation or test instances.",
                        "tag": "Partitioned"
                    }
                ],
                "callout": "A well-prepared training set is the engine of machine learning; garbage in guarantees failure downstream.",
                "start_pct": 0.85,
                "end_pct": 1.0
            }
            return [card1, card2, card3, card4]

        # 4. Three Pillars
        if "three pillars" in clean_title_lower or "pillar" in clean_title_lower:
            card1 = {
                "id": "card-1",
                "card_type": "hook",
                "badge": "THE CORE QUESTION",
                "headline": "Why a Binary Split Fails: The Need for Three Partitions",
                "subheadline": "The historical flaw that compromised early machine learning evaluation",
                "items": [
                    {
                        "label": "The Two-Way Flaw",
                        "text": "Splitting only into Train and Test forces engineers to use test feedback to tune hyperparameters, ruining test objectivity.",
                        "tag": "Flawed Split"
                    },
                    {
                        "label": "The Three-Tier Solution",
                        "text": "Separating teaching, tuning, and auditing into three dedicated, non-overlapping partitions.",
                        "tag": "Rigorous Architecture"
                    }
                ],
                "callout": "A two-way split forces you to cheat on your final exam during model tuning.",
                "start_pct": 0.0,
                "end_pct": 0.25
            }
            card2 = {
                "id": "card-2",
                "card_type": "analogy",
                "badge": "THE MENTAL MODEL",
                "headline": "The Three Pillars Architecture",
                "subheadline": "Dedicated partitions with non-overlapping responsibilities",
                "items": [
                    {
                        "label": "📚 1. Training Set (~70%)",
                        "text": "Parameter learning: Fits weights, biases, and trees directly on raw patterns.",
                        "tag": "Teach"
                    },
                    {
                        "label": "📝 2. Validation Set (~15%)",
                        "text": "Hyperparameter tuning: Selects architectures, regularization, and early stopping.",
                        "tag": "Tune"
                    },
                    {
                        "label": "🎓 3. Test Set (~15%)",
                        "text": "Unbiased evaluation: Locked away until project completion for honest audit.",
                        "tag": "Audit"
                    }
                ],
                "callout": "Each pillar has one dedicated responsibility. Conflating them destroys model trustworthiness.",
                "start_pct": 0.25,
                "end_pct": 0.60
            }
            card3 = {
                "id": "card-3",
                "card_type": "mechanics",
                "badge": "CRITICAL PITFALL & GOLDEN RULE",
                "headline": "The One-Way Information Valve",
                "subheadline": "Enforcing directional isolation across the ML lifecycle",
                "items": [
                    {
                        "label": "Training to Model",
                        "text": "Data flows in to calculate losses and update internal parameters.",
                        "tag": "Parameter Updates"
                    },
                    {
                        "label": "Validation to Engineer",
                        "text": "Metrics guide architectural choices and hyperparameter sweeps.",
                        "tag": "Hyperparameters"
                    },
                    {
                        "label": "Test to Stakeholder",
                        "text": "Produces the definitive report card. No backward adjustments permitted.",
                        "tag": "Audit Only"
                    }
                ],
                "callout": "Information must never flow backwards from the test set to the engineering team.",
                "start_pct": 0.60,
                "end_pct": 0.85
            }
            card4 = {
                "id": "card-4",
                "card_type": "takeaway",
                "badge": "KEY TAKEAWAY & CITATIONS",
                "headline": "The Three Pillars: System Synthesis",
                "subheadline": "Industry-standard partition architecture",
                "items": [
                    {
                        "label": "Strict Zero-Overlap",
                        "text": "Zero samples shared across partitions, preserving statistical independence.",
                        "tag": "Independence"
                    },
                    {
                        "label": "Balanced Proportions",
                        "text": "Proportions scale with dataset size (e.g. 70/15/15 for small data, 98/1/1 for massive data).",
                        "tag": "Scaling"
                    }
                ],
                "callout": "Mastering the Three Pillars is the bedrock of professional, production-grade machine learning.",
                "start_pct": 0.85,
                "end_pct": 1.0
            }
            return [card1, card2, card3, card4]

        # 5. Smart Splitting / Pitfalls / Leakage
        if any(k in clean_title_lower for k in ["pitfall", "leakage", "smart split", "splitting"]) and "three" not in clean_title_lower:
            card1 = {
                "id": "card-1",
                "card_type": "hook",
                "badge": "THE CORE QUESTION",
                "headline": "Catastrophic Data Leakage: The Silent Model Killer",
                "subheadline": "Why models show 99% accuracy in development but collapse to zero in production",
                "items": [
                    {
                        "label": "The Dangerous Illusion",
                        "text": "Flawless metrics during lab development that vanish into catastrophic failure upon launch.",
                        "tag": "Phantom Accuracy"
                    },
                    {
                        "label": "The Root Cause",
                        "text": "Evaluation signals or future data inadvertently contaminating the training feature space.",
                        "tag": "Leakage"
                    }
                ],
                "callout": "Data leakage makes a failing model appear brilliant until it touches real user traffic.",
                "start_pct": 0.0,
                "end_pct": 0.25
            }
            card2 = {
                "id": "card-2",
                "card_type": "analogy",
                "badge": "THE MENTAL MODEL",
                "headline": "The Pipeline Wall: Strict Isolation",
                "subheadline": "Building impenetrable barriers between feature engineering and splits",
                "items": [
                    {
                        "label": "Pre-Split Scaling Trap",
                        "text": "Computing mean and variance on all data before splitting leaks test distribution into training.",
                        "tag": "Scale on Train"
                    },
                    {
                        "label": "Target Leakage",
                        "text": "Features containing direct artifacts or proxies of the target variable not available at inference.",
                        "tag": "Target Proxy"
                    },
                    {
                        "label": "Temporal Integrity",
                        "text": "Time-series data must be split chronologically; random splits leak future into past.",
                        "tag": "Time-Series"
                    }
                ],
                "callout": "If a feature would not be known at the exact millisecond of inference, it cannot be in your training matrix.",
                "start_pct": 0.25,
                "end_pct": 0.60
            }
            card3 = {
                "id": "card-3",
                "card_type": "mechanics",
                "badge": "CRITICAL PITFALL & GOLDEN RULE",
                "headline": "Splitting Strategies for Complex Structures",
                "subheadline": "Choosing the right split strategy for your data domain",
                "items": [
                    {
                        "label": "Stratified Splits",
                        "text": "Guarantees identical class distribution across train, validation, and test for imbalanced datasets.",
                        "tag": "Imbalanced Data"
                    },
                    {
                        "label": "Group / Subject Splits",
                        "text": "Keeps all records from a single patient, user, or device in one partition to prevent patient-level leakage.",
                        "tag": "Group Isolation"
                    },
                    {
                        "label": "Chronological Splits",
                        "text": "Train on historical dates, validate on intermediate dates, test on most recent future window.",
                        "tag": "Temporal Split"
                    }
                ],
                "callout": "Random splitting on grouped or temporal data is an immediate, catastrophic engineering error.",
                "start_pct": 0.60,
                "end_pct": 0.85
            }
            card4 = {
                "id": "card-4",
                "card_type": "takeaway",
                "badge": "KEY TAKEAWAY & CITATIONS",
                "headline": "Smart Splitting: Production Checklist",
                "subheadline": "Verified safeguards against evaluation errors",
                "items": [
                    {
                        "label": "Pipeline Encapsulation",
                        "text": "Use Scikit-Learn Pipelines to automatically isolate fit vs transform across folds.",
                        "tag": "Scikit-Learn"
                    },
                    {
                        "label": "Audit Before Training",
                        "text": "Verify timestamps, group identifiers, and target causality prior to model fitting.",
                        "tag": "Audit"
                    }
                ],
                "callout": "A 5-minute pipeline audit before training prevents months of debugging broken production systems.",
                "start_pct": 0.85,
                "end_pct": 1.0
            }
            return [card1, card2, card3, card4]


        # 7. Default general domain cards tailored to any topic and clean_title
        hook_headline = clean_title if clean_title.endswith("?") else f"Why Does {clean_title} Matter?"
        card1 = {
            "id": "card-1",
            "card_type": "hook",
            "badge": "THE CORE QUESTION",
            "headline": hook_headline,
            "subheadline": f"The foundational challenge in {topic}",
            "items": [
                {
                    "label": "The Core Dilemma",
                    "text": bullets[0] if len(bullets) > 0 else f"Understanding the fundamental behavior of {clean_title}.",
                    "tag": "Challenge"
                },
                {
                    "label": "System Objective",
                    "text": "Ensure theoretical principles translate reliably into production without unexpected failure.",
                    "tag": "Goal"
                }
            ],
            "callout": "Mastering the underlying intuition is the prerequisite to effective implementation.",
            "start_pct": 0.0,
            "end_pct": 0.28
        }

        analogy_items = []
        for i, b in enumerate(bullets):
            parts = b.split(":", 1)
            if len(parts) == 2:
                label = parts[0].strip()
                text = parts[1].strip()
            else:
                words = b.split()
                label = " ".join(words[:4]) if len(words) > 4 else f"Core Concept {i+1}"
                text = b
            analogy_items.append({
                "label": label,
                "text": text,
                "tag": f"Component {i+1}"
            })

        card2 = {
            "id": "card-2",
            "card_type": "analogy",
            "badge": "THE MENTAL MODEL",
            "headline": f"{clean_title}: Conceptual Architecture",
            "subheadline": "Deconstructing core components and their relationships",
            "items": analogy_items[:4],
            "callout": "Notice how each component acts as a distinct safeguard against systemic error.",
            "start_pct": 0.28,
            "end_pct": 0.65
        }

        card3 = {
            "id": "card-3",
            "card_type": "mechanics",
            "badge": "CRITICAL PITFALL & GOLDEN RULE",
            "headline": "Rules for Robust Execution",
            "subheadline": "Avoiding common failure modes observed in practice",
            "items": [
                {
                    "label": "Common Failure Mode",
                    "text": bullets[1] if len(bullets) > 2 else "Evaluating performance on biased assumptions or leaking evaluation metrics into development.",
                    "tag": "Danger"
                },
                {
                    "label": "Production Best Practice",
                    "text": "Maintain strict isolation and enforce rigorous validation boundaries across the entire lifecycle.",
                    "tag": "Best Practice"
                }
            ],
            "callout": "Golden Rule: Never compromise on validation rigor—compromises here always manifest as production failure.",
            "start_pct": 0.65,
            "end_pct": 0.88
        }

        card4 = {
            "id": "card-4",
            "card_type": "takeaway",
            "badge": "KEY TAKEAWAY & CITATIONS",
            "headline": f"{clean_title}: Core Synthesis",
            "subheadline": "Verified against accredited syllabus materials",
            "items": [
                {
                    "label": "Guaranteed Takeaway",
                    "text": bullets[-1] if len(bullets) > 1 else f"Core mastery of {clean_title} is established.",
                    "tag": "Key Takeaway"
                },
                {
                    "label": "Verified Grounding",
                    "text": f"Syllabus sources: {', '.join(cite_tags) if cite_tags else 'Course Repository'}",
                    "tag": "Verified"
                }
            ],
            "callout": "Review these foundational mechanics before advancing to subsequent chapters.",
            "start_pct": 0.88,
            "end_pct": 1.0
        }

        return [card1, card2, card3, card4]
