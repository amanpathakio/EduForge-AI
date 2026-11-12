"""Production JWT authentication, password hashing, and server-side RBAC policies."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Callable, Optional

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

LOCAL_ISSUER = "eduforge-ai"
LOCAL_AUDIENCE = "eduforge-users"
PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with a random 16-byte salt."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    """Verify a plaintext password against a stored PBKDF2 hash in constant time."""
    if not stored_hash:
        return False
    try:
        scheme, iter_str, salt, expected_hex = stored_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        iterations = int(iter_str)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def create_access_token(profile: Profile) -> str:
    """Mint a signed HS256 JWT for an authenticated EduForge profile."""
    if jwt is None:
        raise HTTPException(status_code=500, detail="JWT library is not installed on this server.")
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": profile.id,
        "email": profile.email,
        "role": profile.role,
        "iss": LOCAL_ISSUER,
        "aud": LOCAL_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.get_jwt_secret(), algorithm=settings.JWT_ALGORITHM)


def _unauthorized(detail: str = "Authentication is required."):
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@lru_cache(maxsize=1)
def _jwks_client():
    if not settings.SUPABASE_URL or PyJWKClient is None:
        return None
    return PyJWKClient(
        settings.SUPABASE_JWKS_URL or f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    )


def verify_supabase_token(token: str) -> dict:
    """Verify either an EduForge HS256 token or a Supabase JWKS RS256/ES256 token."""
    if jwt is None:
        _unauthorized("Authentication is not configured on this server.")

    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "")
    except Exception:
        _unauthorized("Invalid access token format.")

    if alg == settings.JWT_ALGORITHM:
        try:
            return jwt.decode(
                token,
                settings.get_jwt_secret(),
                algorithms=[settings.JWT_ALGORITHM],
                audience=LOCAL_AUDIENCE,
                issuer=LOCAL_ISSUER,
            )
        except Exception:
            _unauthorized("Invalid or expired access token.")

    if alg in ("RS256", "ES256") and settings.SUPABASE_URL:
        try:
            key = _jwks_client().get_signing_key_from_jwt(token).key
            return jwt.decode(
                token,
                key,
                algorithms=["RS256", "ES256"],
                audience=settings.SUPABASE_JWT_AUDIENCE,
                issuer=f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1",
            )
        except Exception:
            _unauthorized("Invalid or expired access token.")

    _unauthorized("Unsupported or unverified access token.")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Profile:
    if not credentials or credentials.scheme.lower() != "bearer":
        _unauthorized()
    claims = verify_supabase_token(credentials.credentials)
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        _unauthorized("Token subject is invalid.")
    profile = db.get(Profile, subject)
    if not profile:
        if claims.get("iss") == LOCAL_ISSUER:
            _unauthorized("Account no longer exists.")
        # First login via external Supabase identity provider defaults safely to student.
        profile = Profile(
            id=subject,
            email=claims.get("email"),
            role="student",
            auth_provider="supabase",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def require_roles(*roles: str) -> Callable:
    def dependency(user: Profile = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission for this action.")
        return user

    return dependency


def is_course_manager(db: Session, course_id: str, user: Profile) -> bool:
    """Return True if user owns the course, is admin, or holds a professor membership on it."""
    if user.role == "admin":
        return True
    course = db.get(Course, course_id)
    if not course:
        return False
    if course.owner_id == user.id:
        return True
    membership = db.scalar(
        select(CourseMembership).where(
            CourseMembership.course_id == course_id,
            CourseMembership.user_id == user.id,
        )
    )
    return bool(membership and membership.role == "professor")


def require_course_access(
    course_id: str,
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    if user.role == "admin":
        return course
    member = db.scalar(
        select(CourseMembership).where(
            CourseMembership.course_id == course_id,
            CourseMembership.user_id == user.id,
        )
    )
    if not member and course.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You are not authorized for this course.")
    return course


def require_course_manager(
    course_id: str,
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
) -> Course:
    course = require_course_access(course_id, db, user)
    if not is_course_manager(db, course_id, user):
        raise HTTPException(status_code=403, detail="Only the assigned professor may manage this course.")
    return course


def require_lecture_access(
    lecture_id: str,
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
) -> Lecture:
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found.")
    require_course_access(lecture.course_id, db, user)
    return lecture


def require_lecture_manager(
    lecture_id: str,
    db: Session = Depends(get_db),
    user: Profile = Depends(get_current_user),
) -> Lecture:
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found.")
    require_course_manager(lecture.course_id, db, user)
    return lecture
