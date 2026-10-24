import logging
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, status, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.course import CourseCreate, CourseUpdate, CourseRead, DocumentRead
from app.schemas.chat import CourseChatRequest, ChatResponse
from app.services.course_service import CourseService
from app.rag.retriever import retrieve_relevant_chunks
from app.rag.generator import generate_grounded_answer, GenerationError
from app.rag.embeddings import EmbeddingError
from app.rag.vector_store import VectorStoreError
from app.auth import get_current_user, require_roles, require_course_access, require_course_manager
from app.models.auth import Profile
from app.schemas.agent import CourseArchitectRequest, AgentRunRead
from app.services.agent_service import AgentService
from app.schemas.blueprint import CourseBlueprintRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["Courses"])

@router.get("/{course_id}/agent-runs", response_model=List[AgentRunRead])
def list_agent_runs(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_access)):
    """Visible, auditable history of agent work for an authorized course member."""
    return AgentService.recent_runs(db, course_id)

@router.post("/{course_id}/agent-runs/course-architect", response_model=AgentRunRead, status_code=status.HTTP_201_CREATED)
def start_course_architect(course_id: str, request: CourseArchitectRequest, db: Session = Depends(get_db), user: Profile = Depends(get_current_user), _course=Depends(require_course_manager)):
    """Professor-controlled agent run; it plans but never publishes student-facing content."""
    return AgentService.run_course_architect(db, course_id, user.id, request.goal)

@router.get("/{course_id}/blueprints/latest", response_model=CourseBlueprintRead | None)
def get_latest_blueprint(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_access)):
    return AgentService.latest_blueprint(db, course_id)

@router.post("/{course_id}/blueprints/{blueprint_id}/approve", response_model=CourseBlueprintRead)
def approve_blueprint(course_id: str, blueprint_id: str, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    return AgentService.approve_blueprint(db, course_id, blueprint_id)

@router.post("/{course_id}/blueprints/{blueprint_id}/produce", response_model=AgentRunRead, status_code=status.HTTP_201_CREATED)
def produce_blueprint(course_id: str, blueprint_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: Profile = Depends(get_current_user), _course=Depends(require_course_manager)):
    """Queue full lecture and quiz drafts without making the professor wait for model calls."""
    run = AgentService.queue_blueprint_production(db, course_id, blueprint_id, user.id)
    background_tasks.add_task(AgentService.run_queued_blueprint_production, run.id, blueprint_id)
    return run

@router.post("", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(course_in: CourseCreate, db: Session = Depends(get_db), user: Profile = Depends(require_roles("professor", "admin"))):
    """Create a new course."""
    course = CourseService.create_course(db, course_in, user.id)
    return CourseService.get_course_read(db, course.id)

@router.get("", response_model=List[CourseRead])
def list_courses(db: Session = Depends(get_db), user: Profile = Depends(get_current_user)):
    """List all courses with document and lecture counts."""
    return CourseService.get_courses(db, user.id, user.role == "admin")

@router.get("/{course_id}", response_model=CourseRead)
def get_course(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_access)):
    """Retrieve details for a single course."""
    return CourseService.get_course_read(db, course_id)

@router.patch("/{course_id}", response_model=CourseRead)
def update_course(course_id: str, course_in: CourseUpdate, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    """Update title or description of a course."""
    course = CourseService.update_course(db, course_id, course_in)
    return CourseService.get_course_read(db, course.id)

@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    """Delete a course, its documents, lectures, and associated vector chunks."""
    CourseService.delete_course(db, course_id)
    return None

@router.get("/{course_id}/documents", response_model=List[DocumentRead])
def list_course_documents(course_id: str, db: Session = Depends(get_db), _course=Depends(require_course_access)):
    """List all documents uploaded to a specific course."""
    return CourseService.get_course_documents(db, course_id)

@router.post("/{course_id}/documents/upload", status_code=status.HTTP_201_CREATED)
def upload_course_document(course_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), _course=Depends(require_course_manager)):
    """Upload and index a course PDF document into the course vector space."""
    return CourseService.upload_document_to_course(db, course_id, file)

@router.post("/{course_id}/chat", response_model=ChatResponse)
def course_aware_chat(course_id: str, request: CourseChatRequest, db: Session = Depends(get_db), _course=Depends(require_course_access)):
    """
    Query course material. Strictly retrieves context chunks belonging to `course_id`.
    Maintains grounding rules and citation behavior.
    """
    # Verify course exists

    query = request.get_query()
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query message cannot be empty.")

    try:
        retrieved_chunks = retrieve_relevant_chunks(
            question=query,
            top_k=request.top_k,
            course_id=course_id
        )

        if not retrieved_chunks:
            logger.info(f"No relevant chunks in course '{course_id}'. Returning safe insufficient-info message.")
            return ChatResponse(
                question=query,
                answer="Insufficient information in the uploaded course material to answer the question.",
                sources=[],
                retrieved_chunks=[]
            )

        answer, _, sources = generate_grounded_answer(
            question=query,
            retrieved_chunks=retrieved_chunks
        )

        return ChatResponse(
            question=query,
            answer=answer,
            sources=sources,
            retrieved_chunks=retrieved_chunks
        )

    except (EmbeddingError, VectorStoreError) as e:
        logger.error(f"Course retrieval error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except GenerationError as e:
        logger.error(f"Course chat generation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error in course chat: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Course query failed: {str(e)}")
