"""Small, inspectable orchestration layer for the Course Architect agent."""
from datetime import datetime, timezone
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.agent import AgentRun, AgentRunStep
from app.models.document import Document
from app.models.blueprint import CourseBlueprint, CourseModule
from app.models.lecture import Lecture, LectureSlide
from app.models.quiz import Quiz, QuizQuestion
from app.models.citation import Citation
from app.rag.retriever import retrieve_relevant_chunks
from app.services.lecture_service import LectureService, _call_gemini, _clean_json_markdown
from app.schemas.lecture import LectureGenerateRequest
from app.db.session import SessionLocal
import json

def _now(): return datetime.now(timezone.utc)

class AgentService:
    @staticmethod
    def recent_runs(db: Session, course_id: str):
        return db.scalars(select(AgentRun).where(AgentRun.course_id == course_id).order_by(AgentRun.created_at.desc()).limit(8)).unique().all()

    @staticmethod
    def latest_blueprint(db: Session, course_id: str):
        return db.scalar(select(CourseBlueprint).where(CourseBlueprint.course_id == course_id).order_by(CourseBlueprint.created_at.desc()))

    @staticmethod
    def approve_blueprint(db: Session, course_id: str, blueprint_id: str):
        blueprint = db.scalar(select(CourseBlueprint).where(CourseBlueprint.id == blueprint_id, CourseBlueprint.course_id == course_id))
        if not blueprint: raise HTTPException(status_code=404, detail="Course blueprint not found.")
        blueprint.status = "approved"; blueprint.approved_at = _now()
        for module in blueprint.modules: module.status = "approved"
        db.commit(); db.refresh(blueprint); return blueprint

    @staticmethod
    def _remove_placeholder_lecture(db: Session, lecture: Lecture):
        """Remove the one-slide architect placeholder before saving the full draft."""
        slide_ids = [slide.id for slide in lecture.slides]
        if slide_ids:
            db.execute(delete(Citation).where(Citation.entity_type == "lecture_slide", Citation.entity_id.in_(slide_ids)))
        db.delete(lecture)
        db.flush()

    @staticmethod
    def _build_module_quiz(db: Session, course_id: str, module: CourseModule) -> Quiz:
        chunks = retrieve_relevant_chunks(module.title, top_k=10, course_id=course_id)
        if not chunks:
            raise HTTPException(status_code=400, detail=f"Insufficient source material for {module.title}.")
        context = "\n\n".join(f"[Chunk {index}] {chunk['text']}" for index, chunk in enumerate(chunks, 1))
        prompt = f'''You are EduForge Quiz Builder. Create exactly 5 professor-reviewable multiple-choice questions using ONLY this source context.
Module: {module.title}
Learning objective: {module.objective}
Every question must have 4 plausible options, correct_option (0-3), a concise explanation, and cited_chunk_index. Include a mix of recall, application, and misconception checks. Output ONLY JSON:
{{"title":"...","questions":[{{"prompt":"...","options":["...","...","...","..."],"correct_option":0,"explanation":"...","cited_chunk_index":1}}]}}

SOURCE:\n{context}'''
        data = json.loads(_clean_json_markdown(_call_gemini(prompt)))
        questions = data.get("questions", [])
        if len(questions) != 5:
            raise ValueError("Quiz Builder did not return five questions")
        quiz = Quiz(course_id=course_id, module_id=module.id, title=str(data.get("title") or f"{module.title} practice")[:255], status="draft")
        db.add(quiz); db.flush()
        for position, item in enumerate(questions, 1):
            citation_index = item.get("cited_chunk_index")
            options, correct = item.get("options", []), item.get("correct_option")
            if not isinstance(citation_index, int) or not 1 <= citation_index <= len(chunks):
                raise ValueError("Quiz Builder returned an invalid evidence reference")
            if not isinstance(options, list) or len(options) != 4 or not isinstance(correct, int) or correct not in range(4):
                raise ValueError("Quiz Builder returned invalid answer options")
            if not isinstance(item.get("prompt"), str) or not isinstance(item.get("explanation"), str):
                raise ValueError("Quiz Builder returned incomplete question content")
            source = chunks[citation_index - 1]
            db.add(QuizQuestion(quiz_id=quiz.id, position=position, prompt=item["prompt"], options=options, correct_option=correct, explanation=item["explanation"], learning_objective=module.objective[:255], source_chunk_id=source.get("id"), source_page=source.get("metadata", {}).get("page_number")))
        return quiz

    @staticmethod
    def queue_blueprint_production(db: Session, course_id: str, blueprint_id: str, user_id: str):
        blueprint = db.scalar(select(CourseBlueprint).where(CourseBlueprint.id == blueprint_id, CourseBlueprint.course_id == course_id))
        if not blueprint:
            raise HTTPException(status_code=404, detail="Course blueprint not found.")
        if blueprint.status != "approved":
            raise HTTPException(status_code=409, detail="Approve the blueprint before producing lectures and quizzes.")
        active = db.scalar(select(AgentRun).where(AgentRun.course_id == course_id, AgentRun.agent_type == "lesson_producer", AgentRun.status.in_(["queued", "running"])))
        if active:
            raise HTTPException(status_code=409, detail="Lesson Producer is already working for this course.")
        run = AgentRun(course_id=course_id, initiated_by=user_id, agent_type="lesson_producer", goal=f"Produce lecture decks and quizzes for {blueprint.title}", status="queued")
        db.add(run); db.commit(); db.refresh(run)
        return run

    @staticmethod
    def run_queued_blueprint_production(run_id: str, blueprint_id: str):
        """Own DB session: safe to call from FastAPI BackgroundTasks after the request ends."""
        db = SessionLocal()
        try:
            run = db.get(AgentRun, run_id)
            if run and run.status == "queued":
                AgentService.produce_approved_blueprint(db, run.course_id, blueprint_id, run.initiated_by, existing_run=run)
        finally:
            db.close()

    @staticmethod
    def produce_approved_blueprint(db: Session, course_id: str, blueprint_id: str, user_id: str, existing_run: AgentRun | None = None):
        """Turn an approved plan into source-cited slide decks and real quiz questions."""
        blueprint = db.scalar(select(CourseBlueprint).where(CourseBlueprint.id == blueprint_id, CourseBlueprint.course_id == course_id))
        if not blueprint:
            raise HTTPException(status_code=404, detail="Course blueprint not found.")
        if blueprint.status != "approved":
            raise HTTPException(status_code=409, detail="Approve the blueprint before producing lectures and quizzes.")
        if existing_run:
            run = existing_run
            run.status = "running"
            db.commit(); db.refresh(run)
        else:
            run = AgentRun(course_id=course_id, initiated_by=user_id, agent_type="lesson_producer", goal=f"Produce lecture decks and quizzes for {blueprint.title}", status="running")
            db.add(run); db.commit(); db.refresh(run)
        try:
            lecture_step = AgentService._step(db, run, 1, "lecture_producer", "Producing visual lecture drafts", "Creating concise, source-cited slide decks for each approved module.")
            lecture_ids = []
            for module in blueprint.modules:
                for placeholder in db.scalars(select(Lecture).where(Lecture.module_id == module.id)).all():
                    AgentService._remove_placeholder_lecture(db, placeholder)
                lecture = LectureService.generate_lecture(db, course_id, LectureGenerateRequest(topic=module.title, duration_minutes=25, difficulty="beginner", slide_count=7, additional_instructions=f"Module objective: {module.objective}. Create an engaging visual teaching arc: hook, concept, supported example, misconception check, recap. Speaker notes are optional presenter guidance and must not repeat the slide."))
                saved_lecture = db.get(Lecture, lecture.id)
                saved_lecture.module_id = module.id
                db.commit()
                lecture_ids.append(lecture.id)
            AgentService._finish(db, lecture_step, {"lecture_drafts_created": len(lecture_ids), "lecture_ids": lecture_ids, "slides_per_lecture": 7})
            quiz_step = AgentService._step(db, run, 2, "quiz_builder", "Building reviewable practice", "Creating five source-grounded questions for every approved module.")
            quiz_ids = []
            for module in blueprint.modules:
                for placeholder in db.scalars(select(Quiz).where(Quiz.module_id == module.id)).all():
                    db.delete(placeholder)
                quiz = AgentService._build_module_quiz(db, course_id, module)
                db.commit()
                quiz_ids.append(quiz.id)
            AgentService._finish(db, quiz_step, {"quiz_drafts_created": len(quiz_ids), "quiz_ids": quiz_ids, "questions_per_quiz": 5})
            quality_step = AgentService._step(db, run, 3, "quality_gate", "Holding drafts for review", "Nothing is published to students; review slides and questions before publishing.")
            AgentService._finish(db, quality_step, {"publication_required": True})
            run.status = "awaiting_approval"; run.result = {"blueprint_id": blueprint.id, "lecture_drafts": len(lecture_ids), "quiz_drafts": len(quiz_ids), "status": "review_required"}; run.completed_at = _now(); db.commit(); db.refresh(run)
            return run
        except Exception as exc:
            run.status = "failed"; run.error = "Lesson Producer could not complete this run."; run.completed_at = _now(); db.commit()
            raise HTTPException(status_code=502, detail="Lesson Producer failed. Check the source material and AI configuration, then retry.") from exc

    @staticmethod
    def _step(db, run, position, tool, title, detail):
        step = AgentRunStep(run_id=run.id, position=position, tool=tool, title=title, detail=detail, status="running")
        db.add(step); db.commit(); db.refresh(step); return step

    @staticmethod
    def _finish(db, step, output):
        step.status = "completed"; step.output = output; step.completed_at = _now(); db.commit()

    @staticmethod
    def run_course_architect(db: Session, course_id: str, user_id: str, goal: str):
        documents = db.scalars(select(Document).where(Document.course_id == course_id)).all()
        if not documents:
            raise HTTPException(status_code=400, detail="Upload at least one course document before starting the Course Architect.")
        run = AgentRun(course_id=course_id, initiated_by=user_id, goal=goal, status="running")
        db.add(run); db.commit(); db.refresh(run)
        try:
            evidence = AgentService._step(db, run, 1, "evidence_map", "Mapping source evidence", f"Inspecting {len(documents)} indexed document(s).")
            chunks = retrieve_relevant_chunks(goal, top_k=10, course_id=course_id)
            evidence_output = {"documents": [{"filename": d.filename, "pages": d.pages_count, "chunks": d.chunks_count} for d in documents], "evidence_pages": sorted({c.get("metadata", {}).get("page_number") for c in chunks if c.get("metadata", {}).get("page_number")})}
            AgentService._finish(db, evidence, evidence_output)
            plan_step = AgentService._step(db, run, 2, "learning_design", "Designing the learning arc", "Turning retrieved evidence into an explainable course sequence.")
            context = "\n".join(f"[page {c.get('metadata', {}).get('page_number', '?')}] {c['text'][:900]}" for c in chunks)
            prompt = f'''You are EduForge Course Architect. Using ONLY the source excerpts below, produce JSON with keys: course_summary (string), concepts (array of 4-8 concise strings), modules (array of 3-6 objects with title, objective, evidence_pages array), and professor_review (array of 2 concise review questions). Goal: {goal}\n\nSOURCE:\n{context}'''
            try:
                plan = json.loads(_clean_json_markdown(_call_gemini(prompt))) if chunks else {}
            except Exception:
                plan = {}
            if not plan:
                plan = {"course_summary": "The agent found source material and prepared an evidence-first course map for professor review.", "concepts": [d.filename for d in documents], "modules": [{"title": "Source-grounded introduction", "objective": goal, "evidence_pages": evidence_output["evidence_pages"][:5]}], "professor_review": ["Does this sequence match your syllabus?", "Which module should become the first lecture?"]}
            AgentService._finish(db, plan_step, plan)
            materialize = AgentService._step(db, run, 3, "artifact_builder", "Creating editable course drafts", "Creating a blueprint, modules, lecture drafts, and quiz drafts for review.")
            blueprint = CourseBlueprint(course_id=course_id, agent_run_id=run.id, title=f"{plan.get('course_summary', 'Course')} — Architect Blueprint"[:255], summary=plan.get("course_summary", ""), status="draft")
            db.add(blueprint); db.flush()
            created_modules = []
            for position, module_plan in enumerate(plan.get("modules", []), 1):
                title = str(module_plan.get("title") or f"Module {position}")[:255]
                objective = str(module_plan.get("objective") or goal)
                # Models commonly return page numbers as JSON strings. Normalize
                # them before saving so the professor can inspect source links.
                pages = []
                for page in module_plan.get("evidence_pages", []):
                    try:
                        normalized_page = int(str(page).strip())
                    except (TypeError, ValueError):
                        continue
                    if normalized_page > 0 and normalized_page not in pages:
                        pages.append(normalized_page)
                module = CourseModule(blueprint_id=blueprint.id, course_id=course_id, position=position, title=title, objective=objective, evidence_pages=pages, status="draft")
                db.add(module); db.flush(); created_modules.append(module)
                # Artifacts are deliberate drafts: agents never publish student-facing work.
                lecture = Lecture(course_id=course_id, module_id=module.id, title=f"Draft: {title}"[:255], topic=title, learning_objectives=[objective], status="draft", additional_instructions=f"Created by Course Architect run {run.id}; evidence pages: {pages}")
                db.add(lecture); db.flush()
                db.add(LectureSlide(lecture_id=lecture.id, slide_number=1, title=title, content=[objective, f"Ground this lecture in source pages: {', '.join(map(str, pages)) if pages else 'review mapped evidence'}"], speaker_notes="Course Architect starter slide. Expand or regenerate this draft after professor review."))
                db.add(Quiz(course_id=course_id, module_id=module.id, title=f"Draft practice: {title}"[:255], status="draft"))
            db.commit()
            AgentService._finish(db, materialize, {"blueprint_id": blueprint.id, "modules_created": len(created_modules), "lecture_drafts_created": len(created_modules), "quiz_drafts_created": len(created_modules)})
            review = AgentService._step(db, run, 4, "quality_gate", "Preparing approval checkpoint", "Drafts exist only in the professor workspace until this blueprint is approved.")
            AgentService._finish(db, review, {"approval_required": True, "next_action": "Approve the blueprint, then review the created lecture and quiz drafts."})
            plan["blueprint_id"] = blueprint.id; plan["artifacts"] = {"modules": len(created_modules), "lecture_drafts": len(created_modules), "quiz_drafts": len(created_modules)}
            run.status = "awaiting_approval"; run.result = plan; run.completed_at = _now(); db.commit(); db.refresh(run)
            return run
        except Exception as exc:
            run.status = "failed"; run.error = "Course Architect could not complete this run."; run.completed_at = _now(); db.commit()
            raise HTTPException(status_code=502, detail="Course Architect run failed. Please retry after checking your AI configuration.") from exc
