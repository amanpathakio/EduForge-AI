import logging
from typing import List, Optional, Literal
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.config import settings
from app.auth import get_current_user, hash_password
from app.models.auth import Profile, CourseMembership
from app.models.course import Course
from app.models.document import Document
from app.models.lecture import Lecture
from app.models.quiz import Quiz

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Super Admin"])


def require_admin(user: Profile = Depends(get_current_user)) -> Profile:
    """Strict gate: Only users with role=='admin' can access admin endpoints."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This console is restricted strictly to platform administrators."
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


class CreateUserRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    full_name: Optional[str] = Field(default=None, max_length=160)
    password: str = Field(..., min_length=8, max_length=128)
    role: Literal["student", "professor", "admin"] = "student"


class RoleUpdateRequest(BaseModel):
    role: Literal["student", "professor", "admin"]


class ResetUserPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


class AdminStatsResponse(BaseModel):
    total_users: int
    students_count: int
    professors_count: int
    admins_count: int
    total_courses: int
    total_documents: int
    total_lectures: int
    total_quizzes: int


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(db: Session = Depends(get_db), _admin: Profile = Depends(require_admin)):
    """Institutional overview of accounts, courses, and educational assets."""
    total_users = db.scalar(select(func.count(Profile.id))) or 0
    students_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "student")) or 0
    professors_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "professor")) or 0
    admins_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "admin")) or 0

    total_courses = db.scalar(select(func.count(Course.id))) or 0
    total_documents = db.scalar(select(func.count(Document.id))) or 0
    total_lectures = db.scalar(select(func.count(Lecture.id))) or 0
    total_quizzes = db.scalar(select(func.count(Quiz.id))) or 0

    return AdminStatsResponse(
        total_users=total_users,
        students_count=students_count,
        professors_count=professors_count,
        admins_count=admins_count,
        total_courses=total_courses,
        total_documents=total_documents,
        total_lectures=total_lectures,
        total_quizzes=total_quizzes,
    )


@router.get("/users", response_model=List[UserOverview])
def list_all_users(db: Session = Depends(get_db), _admin: Profile = Depends(require_admin)):
    """List every account in the system (students, professors, administrators)."""
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


@router.post("/users", response_model=UserOverview, status_code=status.HTTP_201_CREATED)
def create_user_by_admin(
    payload: CreateUserRequest,
    db: Session = Depends(get_db),
    admin: Profile = Depends(require_admin)
):
    """Directly provision a new student, professor, or administrator account."""
    clean_email = payload.email.strip().lower()
    existing = db.scalar(select(Profile).where(Profile.email == clean_email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An account with email '{clean_email}' already exists."
        )

    new_profile = Profile(
        email=clean_email,
        full_name=(payload.full_name or "").strip() or None,
        password_hash=hash_password(payload.password),
        auth_provider="local",
        role=payload.role,
    )
    db.add(new_profile)
    db.commit()
    db.refresh(new_profile)

    logger.info(f"Admin {admin.email} created new user {new_profile.email} with role '{new_profile.role}'.")
    return UserOverview(
        id=new_profile.id,
        email=new_profile.email,
        full_name=new_profile.full_name,
        role=new_profile.role,
        auth_provider=new_profile.auth_provider,
        created_at=new_profile.created_at,
        courses_count=0,
    )


@router.patch("/users/{user_id}/role", response_model=UserOverview)
def update_user_role(
    user_id: str,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    admin: Profile = Depends(require_admin)
):
    """
    Promote or demote any user.
    Admins can remove other professors or demote another admin back to professor/student.
    """
    target = db.get(Profile, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target user account not found.")

    # Guard: Never demote the only remaining administrator
    if target.role == "admin" and payload.role != "admin":
        admin_count = db.scalar(select(func.count(Profile.id)).where(Profile.role == "admin")) or 0
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the only administrator. Promote another user to Admin first."
            )

    old_role = target.role
    target.role = payload.role
    db.commit()
    db.refresh(target)

    logger.info(f"Admin {admin.email} changed role of {target.email} from '{old_role}' to '{payload.role}'.")

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


@router.post("/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: str,
    payload: ResetUserPasswordRequest,
    db: Session = Depends(get_db),
    admin: Profile = Depends(require_admin)
):
    """Directly reset password for any student or professor who lost access."""
    target = db.get(Profile, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User account not found.")

    target.password_hash = hash_password(payload.new_password)
    db.commit()
    logger.info(f"Admin {admin.email} reset password for {target.email}.")
    return {"status": "success", "message": f"Password for '{target.email}' was successfully updated."}


@router.delete("/users/{user_id}")
def delete_user_account(
    user_id: str,
    db: Session = Depends(get_db),
    admin: Profile = Depends(require_admin)
):
    """Permanently expel/remove any student or professor from the institution."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own active administrator account.")

    target = db.get(Profile, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User account not found.")

    target_email = target.email or target.id
    target_role = target.role

    # Clean up memberships
    db.delete(target)
    db.commit()

    logger.info(f"Admin {admin.email} deleted {target_role} account '{target_email}'.")
    return {"status": "success", "message": f"Account '{target_email}' ({target_role}) has been removed."}
