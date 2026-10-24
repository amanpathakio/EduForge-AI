from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.course import Course
from app.models.quiz import Quiz, QuizQuestion, QuizAttempt
import json
from app.schemas.quiz import QuizCreate, QuizRead, QuizAttemptCreate, QuizFeedback, QuizGenerateRequest
from app.rag.retriever import retrieve_relevant_chunks
from app.services.lecture_service import _call_gemini, _clean_json_markdown
from app.auth import get_current_user, require_course_access, require_course_manager
from app.models.auth import Profile

router = APIRouter(prefix="/courses/{course_id}/quizzes", tags=["Quizzes"])

def _course(db: Session, course_id: str) -> Course:
    course = db.scalar(select(Course).where(Course.id == course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course

@router.get("", response_model=list[QuizRead])
def list_quizzes(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    _course(db, course_id)
    return db.scalars(select(Quiz).where(Quiz.course_id == course_id).order_by(Quiz.created_at.desc())).all()

@router.post("", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
def create_quiz(course_id: str, quiz_in: QuizCreate, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    _course(db, course_id)
    quiz = Quiz(course_id=course_id, title=quiz_in.title.strip(), status="draft")
    db.add(quiz)
    db.flush()
    for position, question in enumerate(quiz_in.questions, 1):
        db.add(QuizQuestion(quiz_id=quiz.id, position=position, **question.model_dump()))
    db.commit()
    db.refresh(quiz)
    return quiz

@router.post("/generate", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
def generate_quiz(course_id: str, request: QuizGenerateRequest, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    _course(db, course_id)
    chunks = retrieve_relevant_chunks(request.topic, top_k=min(request.question_count * 2, 12), course_id=course_id)
    if not chunks:
        raise HTTPException(status_code=400, detail="Insufficient course material for this quiz topic.")
    context = "\n\n".join(f"[{i}] {c['text']}" for i, c in enumerate(chunks, 1))
    prompt = f'''Create a professor-reviewable multiple-choice quiz using ONLY this course context. Topic: {request.topic}. Difficulty: {request.difficulty}. Create exactly {request.question_count} questions. Each question must have 4 options, correct_option (0-3), a concise explanation, and cited_chunk_index. Output ONLY JSON: {{"title":"...","questions":[{{"prompt":"...","options":["..."],"correct_option":0,"explanation":"...","cited_chunk_index":1}}]}}.\n\nCONTEXT:\n{context}'''
    try:
        data = json.loads(_clean_json_markdown(_call_gemini(prompt)))
        questions = data.get("questions", [])
        if len(questions) != request.question_count:
            raise ValueError("AI did not create the requested number of questions")
        quiz = Quiz(course_id=course_id, title=data.get("title", f"{request.topic} practice"), status="draft")
        db.add(quiz); db.flush()
        for position, item in enumerate(questions, 1):
            cited_index = item.get("cited_chunk_index", 1)
            if not isinstance(cited_index, int) or not 1 <= cited_index <= len(chunks):
                raise ValueError("Question citation does not point to supplied course evidence")
            cited = chunks[cited_index - 1]
            options = item.get("options", [])
            correct = item.get("correct_option")
            if len(options) != 4 or not isinstance(correct, int) or correct not in range(4):
                raise ValueError("Invalid question options")
            if not isinstance(item.get("prompt"), str) or not isinstance(item.get("explanation"), str):
                raise ValueError("Question content is incomplete")
            db.add(QuizQuestion(quiz_id=quiz.id, position=position, prompt=item["prompt"], options=options, correct_option=correct, explanation=item["explanation"], source_chunk_id=cited.get("id"), source_page=cited.get("metadata", {}).get("page_number")))
        db.commit(); db.refresh(quiz); return quiz
    except HTTPException: raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to generate a reviewable quiz: {exc}")

@router.post("/{quiz_id}/publish", response_model=QuizRead)
def publish_quiz(course_id: str, quiz_id: str, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    """Explicit professor approval gate before a quiz can be shown to students."""
    _course(db, course_id)
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.course_id == course_id))
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    if not quiz.questions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This is an empty planning placeholder, not a reviewable assessment. Generate questions before publishing it.",
        )
    quiz.status = "published"
    db.commit()
    db.refresh(quiz)
    return quiz

@router.get("/published", response_model=list[QuizRead])
def list_published_quizzes(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_access)):
    _course(db, course_id)
    return db.scalars(select(Quiz).where(Quiz.course_id == course_id, Quiz.status == "published")).all()

@router.post("/{quiz_id}/questions/{question_id}/attempts", response_model=QuizFeedback)
def submit_attempt(course_id: str, quiz_id: str, question_id: str, attempt: QuizAttemptCreate, db: Session = Depends(get_db), user: Profile = Depends(get_current_user), _course=Depends(require_course_access)):
    question = db.scalar(select(QuizQuestion).join(Quiz).where(QuizQuestion.id == question_id, Quiz.id == quiz_id, Quiz.course_id == course_id, Quiz.status == "published"))
    if not question:
        raise HTTPException(status_code=404, detail="Published quiz question not found.")
    if attempt.selected_option >= len(question.options):
        raise HTTPException(status_code=422, detail="Selected option is not valid for this question.")
    correct = attempt.selected_option == question.correct_option
    db.add(QuizAttempt(question_id=question.id, learner_id=user.id, selected_option=attempt.selected_option, is_correct=correct))
    db.commit()
    return QuizFeedback(correct=correct, correct_option=question.correct_option, explanation=question.explanation, source_page=question.source_page)
