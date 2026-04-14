"""Registration and login routes.

All business logic lives in `app.services.auth_service`.
"""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field

from app.core.auth import require_role
from app.services.auth_service import (
    get_client_by_email as get_client_by_email_service,
    login_client as login_client_service,
    login_user as login_user_service,
    register_client as register_client_service,
    register_user as register_user_service,
)

router = APIRouter(tags=["Registration & Login"])


async def check_rate_limit(request: Request):
    """Dependency to check rate limits using the app's limiter."""
    if hasattr(request.app, 'state') and hasattr(request.app.state, 'limiter'):
        limiter = request.app.state.limiter
        await limiter.limit("5/minute")(request)
    return True


# ── GET /clients/by-email?email=...  ─────────────────────────
@router.get("/clients/by-email")
async def get_client_by_email(
    email: str,
    _actor: dict = Depends(require_role("user")),
):
    return await get_client_by_email_service(email)


# ── Shared request bodies ─────────────────────────────────────
class RegisterBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class RegisterClientBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)


# ── POST /register/user ──────────────────────────────────────
@router.post("/register/user")
async def register_user(payload: RegisterBody):
    return await register_user_service(payload)


# ── POST /register/client ────────────────────────────────────
@router.post("/register/client")
async def register_client(payload: RegisterClientBody):
    return await register_client_service(payload)


# ── POST /login/user ─────────────────────────────────────────
@router.post("/login/user")
async def login_user(
    payload: LoginBody,
    _: bool = Depends(check_rate_limit),
):
    return await login_user_service(payload)


# ── POST /login/client ───────────────────────────────────────
@router.post("/login/client")
async def login_client(
    payload: LoginBody,
    _: bool = Depends(check_rate_limit),
):
    return await login_client_service(payload)
