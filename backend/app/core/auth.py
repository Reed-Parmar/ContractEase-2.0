"""Authentication and authorization dependencies."""

from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import verify_access_token


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")

    claims = verify_access_token(credentials.credentials)
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    return claims


def require_role(*roles: str) -> Callable:
    allowed = {role.strip().lower() for role in roles if role and role.strip()}
    if not allowed:
        raise ValueError("require_role() requires at least one non-empty role")

    async def _dependency(actor: dict = Depends(get_current_actor)) -> dict:
        raw_role = actor.get("role")
        if isinstance(raw_role, (list, tuple, set)):
            roles_list = [str(role).strip().lower() for role in raw_role if str(role).strip()]
        else:
            normalized_role = str(raw_role or "").strip().lower()
            roles_list = [normalized_role] if normalized_role else []

        if not any(role in allowed for role in roles_list):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return actor

    return _dependency
