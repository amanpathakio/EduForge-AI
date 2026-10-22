"""Supabase JWT verification and server-side authorization policies."""
from functools import lru_cache
from typing import Callable
try:
    import jwt
    from jwt import PyJWKClient
except ImportError:  # Local developer environments must fail closed until requirements are installed.
    jwt = None
    PyJWKClient = None
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import settings
from app.db.session import get_db
from app.models.auth import Profile, CourseMembership
from app.models.course import Course
from app.models.lecture import Lecture

bearer = HTTPBearer(auto_error=False)

def _unauthorized(detail="Authentication is required."):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})

@lru_cache(maxsize=1)
def _jwks_client():
    if not settings.SUPABASE_URL or PyJWKClient is None:
        return None
    return PyJWKClient(settings.SUPABASE_JWKS_URL or f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json")

def verify_supabase_token(token: str) -> dict:
    """Verify signature, issuer, audience and expiry; never trust unverified claims."""
    if not settings.SUPABASE_URL or jwt is None:
        _unauthorized("Authentication is not configured on this server.")
    try:
        key = _jwks_client().get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["RS256", "ES256"], audience=settings.SUPABASE_JWT_AUDIENCE,
                          issuer=f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1")
    except Exception:
        _unauthorized("Invalid or expired access token.")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> Profile:
    if not credentials or credentials.scheme.lower() != "bearer":
        _unauthorized()
    claims = verify_supabase_token(credentials.credentials)
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        _unauthorized("Token subject is invalid.")
    profile = db.get(Profile, subject)
    if not profile:
        # Roles come only from the database. Safe default for a first authenticated login.
        profile = Profile(id=subject, email=claims.get("email"), role="student")
        db.add(profile); db.commit(); db.refresh(profile)
    return profile

def require_roles(*roles: str) -> Callable:
    def dependency(user: Profile = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission for this action.")
        return user
    return dependency

def require_course_access(course_id: str, db: Session = Depends(get_db), user: Profile = Depends(get_current_user)) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    if user.role == "admin":
        return course
    member = db.scalar(select(CourseMembership).where(CourseMembership.course_id == course_id, CourseMembership.user_id == user.id))
    if not member and course.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You are not authorized for this course.")
    return course

def require_course_manager(course_id: str, db: Session = Depends(get_db), user: Profile = Depends(get_current_user)) -> Course:
    course = require_course_access(course_id, db, user)
    if user.role == "admin" or course.owner_id == user.id:
        return course
    membership = db.scalar(select(CourseMembership).where(CourseMembership.course_id == course_id, CourseMembership.user_id == user.id))
    if not membership or membership.role != "professor":
        raise HTTPException(status_code=403, detail="Only the assigned professor may manage this course.")
    return course

def require_lecture_access(lecture_id: str, db: Session = Depends(get_db), user: Profile = Depends(get_current_user)) -> Lecture:
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found.")
    require_course_access(lecture.course_id, db, user)
    return lecture

def require_lecture_manager(lecture_id: str, db: Session = Depends(get_db), user: Profile = Depends(get_current_user)) -> Lecture:
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found.")
    require_course_manager(lecture.course_id, db, user)
    return lecture
