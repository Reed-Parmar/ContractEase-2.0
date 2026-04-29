"""Registration and login routes.

All business logic lives in `app.services.auth_service`.
"""

from fastapi import APIRouter, Depends, Request
from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field
import asyncio
import time

from app.core.auth import require_role
from app.services.auth_service import (
    get_client_by_email as get_client_by_email_service,
    login_client as login_client_service,
    login_user as login_user_service,
    register_client as register_client_service,
    register_user as register_user_service,
)

router = APIRouter(tags=["Registration & Login"])

_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_WINDOW_SECONDS = 60.0
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_MAX_TRACKED_IPS = 5000
_LOGIN_ATTEMPTS_LOCK = asyncio.Lock()


async def check_rate_limit(request: Request):
    """Lightweight per-IP rate limiting for login endpoints."""
    client_host = request.client.host if request.client else "unknown"
    now = time.monotonic()

    async with _LOGIN_ATTEMPTS_LOCK:
        attempts = _LOGIN_ATTEMPTS.setdefault(client_host, [])
        attempts[:] = [stamp for stamp in attempts if now - stamp < _LOGIN_WINDOW_SECONDS]

        if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")

        attempts.append(now)

        if len(_LOGIN_ATTEMPTS) > _LOGIN_MAX_TRACKED_IPS:
            stale_hosts = [
                host
                for host, stamps in _LOGIN_ATTEMPTS.items()
                if not stamps or now - stamps[-1] >= _LOGIN_WINDOW_SECONDS
            ]
            for host in stale_hosts:
                _LOGIN_ATTEMPTS.pop(host, None)

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
