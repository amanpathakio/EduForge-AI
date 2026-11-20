import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.config import settings
from app.auth import get_current_user
from app.models.auth import Profile, CourseMembership
from app.models.course import Course
from app.models.document import Document
from app.models.lecture import Lecture
from app.models.quiz import Quiz
from app.rag.vector_store import vector_store_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Super Admin"])


def require_admin_or_professor(user: Profile = Depends(get_current_user)) -> Profile:
    if user.role not in ("admin", "professor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to platform administrators and faculty leadership."
        )
    return user


class UserOverview(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    auth_provider: str
    created_at: Optional[datetime] = None
    courses_count: int = 0


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(student|professor|admin)$")


class AdminStatsResponse(BaseModel):
    total_users: int
    students_count: int
    professors_count: int
    admins_count: int
    total_courses: int
    total_documents: int
    total_chunks_indexed: int
    total_lectures: int
    total_quizzes: int
    gemini_configured: bool
    elevenlabs_configured: bool
    database_status: str
    chroma_status: str


class AddKeyRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=128)


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(db: Session = Depends(get_db), _user: Profile = Depends(require_admin_or_professor)):
    """Return high-level institutional and AI health diagnostics."""
    total_users = db.scalar(select(func.count(Profile.id))) or 0
    students_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "student")) or 0
    professors_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "professor")) or 0
    admins_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "admin")) or 0
    
    total_courses = db.scalar(select(func.count(Course.id))) or 0
    total_documents = db.scalar(select(func.count(Document.id))) or 0
    total_lectures = db.scalar(select(func.count(Lecture.id))) or 0
    total_quizzes = db.scalar(select(func.count(Quiz.id))) or 0

    chroma_count = 0
    chroma_healthy = "healthy"
    try:
        chroma_count = vector_store_manager.count()
    except Exception as e:
        chroma_healthy = f"degraded: {str(e)}"

    return AdminStatsResponse(
        total_users=total_users,
        students_count=students_count,
        professors_count=professors_count,
        admins_count=admins_count,
        total_courses=total_courses,
        total_documents=total_documents,
        total_chunks_indexed=chroma_count if isinstance(chroma_count, int) else 0,
        total_lectures=total_lectures,
        total_quizzes=total_quizzes,
        gemini_configured=bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here"),
        elevenlabs_configured=bool(settings.ELEVENLABS_API_KEY),
        database_status="healthy",
        chroma_status=chroma_healthy,
    )


@router.get("/users", response_model=List[UserOverview])
def list_all_users(db: Session = Depends(get_db), _user: Profile = Depends(require_admin_or_professor)):
    """List all user accounts in the institution with role and course associations."""
    profiles = db.scalars(select(Profile).order_by(Profile.created_at.desc())).all()
    results = []
    for p in profiles:
        c_count = db.scalar(
            select(func.count(CourseMembership.id)).where(CourseMembership.user_id == p.id)
        ) or 0
        results.append(
            UserOverview(
                id=p.id,
                email=p.email,
                full_name=p.full_name,
                role=p.role,
                auth_provider=p.auth_provider,
                created_at=p.created_at,
                courses_count=c_count,
            )
        )
    return results


@router.patch("/users/{user_id}/role", response_model=UserOverview)
def update_user_role(
    user_id: str,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(require_admin_or_professor)
):
    """Change a user's role (promote/demote between student, professor, admin)."""
    target = db.get(Profile, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found.")
    
    # Self-demotion guard
    if target.id == current_user.id and payload.role != "admin" and current_user.role == "admin":
        admin_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "admin")) or 0
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the only remaining platform administrator.")

    target.role = payload.role
    db.commit()
    db.refresh(target)
    logger.info(f"User {target.email} ({target.id}) updated to role '{payload.role}' by {current_user.email}")

    c_count = db.scalar(select(func.count(CourseMembership.id)).where(CourseMembership.user_id == target.id)) or 0
    return UserOverview(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=target.role,
        auth_provider=target.auth_provider,
        created_at=target.created_at,
        courses_count=c_count,
    )


@router.delete("/users/{user_id}")
def delete_user_account(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: Profile = Depends(require_admin_or_professor)
):
    """Permanently delete a user account and associated memberships."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    target = db.get(Profile, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User account not found.")

    db.delete(target)
    db.commit()
    logger.info(f"User {target.email} deleted by {current_user.email}")
    return {"status": "success", "message": f"User '{target.email or target.id}' deleted successfully."}


@router.get("/faculty-keys")
def list_faculty_keys(_user: Profile = Depends(require_admin_or_professor)):
    """List active faculty authorization codes configured in the system."""
    raw = (settings.EDUCATOR_ACCESS_CODE or "").strip()
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    return {
        "active_keys": keys,
        "count": len(keys),
        "primary_key": keys[0] if keys else None
    }


@router.post("/faculty-keys")
def add_faculty_key(payload: AddKeyRequest, _user: Profile = Depends(require_admin_or_professor)):
    """Dynamically append a new faculty authorization key into active memory."""
    new_code = payload.code.strip()
    raw = (settings.EDUCATOR_ACCESS_CODE or "").strip()
    current_keys = [k.strip() for k in raw.split(",") if k.strip()]
    if new_code in current_keys:
        return {"status": "exists", "message": "Key is already active.", "keys": current_keys}
    current_keys.append(new_code)
    settings.EDUCATOR_ACCESS_CODE = ",".join(current_keys)
    logger.info(f"New faculty authorization key '{new_code}' activated by {_user.email}")
    return {"status": "success", "message": "Faculty key activated.", "keys": current_keys}


@router.post("/promote-me")
def promote_self_to_admin(
    db: Session = Depends(get_db),
    current_user: Profile = Depends(get_current_user)
):
    """Elevate the current faculty user account to platform Admin."""
    current_user.role = "admin"
    db.commit()
    db.refresh(current_user)
    logger.info(f"User {current_user.email} promoted self to 'admin'.")
    return {"status": "success", "role": "admin", "message": "Account promoted to platform Administrator."}
