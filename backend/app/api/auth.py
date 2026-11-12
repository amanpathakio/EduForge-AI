"""Built-in production authentication endpoints: register, login, identity profile, role upgrade."""
import hmac
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.db.session import get_db
from app.models.auth import Profile

router = APIRouter(prefix="/auth", tags=["Authentication"])


class AuthUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    auth_provider: str = "local"


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUserRead


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=160)
    requested_role: Literal["student", "professor"] = "student"
    educator_code: Optional[str] = Field(default=None, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=1, max_length=128)


class UpgradeRoleRequest(BaseModel):
    educator_code: str = Field(..., min_length=1, max_length=128)


def _normalize_email(raw: str) -> str:
    cleaned = raw.strip().lower()
    if "@" not in cleaned or "." not in cleaned.split("@", 1)[-1]:
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")
    return cleaned


def _verify_educator_code(supplied_code: Optional[str]) -> bool:
    configured = (settings.EDUCATOR_ACCESS_CODE or "").strip()
    candidate = (supplied_code or "").strip()
    if not configured or not candidate:
        return False
    return hmac.compare_digest(candidate, configured)


@router.get("/capabilities")
def auth_capabilities():
    """Public capability advertisement for login UI configuration."""
    return {
        "local_auth_enabled": True,
        "educator_code_configured": bool((settings.EDUCATOR_ACCESS_CODE or "").strip()),
        "supabase_configured": bool(settings.SUPABASE_URL),
    }


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    existing = db.scalar(select(Profile).where(Profile.email == email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    assigned_role = "student"
    if payload.requested_role == "professor":
        if not (settings.EDUCATOR_ACCESS_CODE or "").strip():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Self-service educator signup requires an institutional educator access code to be configured.",
            )
        if not _verify_educator_code(payload.educator_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid educator access code. Select Student or enter a verified educator code.",
            )
        assigned_role = "professor"

    profile = Profile(
        email=email,
        full_name=(payload.full_name or "").strip() or None,
        password_hash=hash_password(payload.password),
        auth_provider="local",
        role=assigned_role,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    token = create_access_token(profile)
    return AuthTokenResponse(access_token=token, user=AuthUserRead.model_validate(profile))


@router.post("/login", response_model=AuthTokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    profile = db.scalar(select(Profile).where(Profile.email == email))
    if not profile or not verify_password(payload.password, profile.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    token = create_access_token(profile)
    return AuthTokenResponse(access_token=token, user=AuthUserRead.model_validate(profile))


@router.get("/me", response_model=AuthUserRead)
def get_me(user: Profile = Depends(get_current_user)):
    return AuthUserRead.model_validate(user)


@router.post("/upgrade-role", response_model=AuthTokenResponse)
def upgrade_to_professor(
    payload: UpgradeRoleRequest,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify an educator access code on an existing account to unlock Professor Studio."""
    if user.role in ("professor", "admin"):
        return AuthTokenResponse(access_token=create_access_token(user), user=AuthUserRead.model_validate(user))

    if not _verify_educator_code(payload.educator_code):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid educator access code.")

    user.role = "professor"
    db.commit()
    db.refresh(user)
    return AuthTokenResponse(access_token=create_access_token(user), user=AuthUserRead.model_validate(user))
