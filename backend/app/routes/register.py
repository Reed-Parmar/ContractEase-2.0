"""
Registration & login routes for testing MongoDB integration.
No JWT, no hashing — just raw inserts / lookups for demo.
"""

from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from app.core.auth import require_role
from app.core.security import ACCESS_TOKEN_TTL_SECONDS, create_access_token, hash_password, verify_password
from app.db.mongo import users_collection, clients_collection

router = APIRouter(tags=["Registration & Login"])


def _normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


async def _find_by_email(collection, email: str):
    """Find by normalized email, with case-insensitive fallback for legacy rows."""
    normalized = _normalize_email(email)
    if not normalized:
        return None

    exact = await collection.find_one({"email": normalized})
    if exact:
        return exact

    escaped = re.escape(normalized)
    return await collection.find_one({"email": {"$regex": f"^{escaped}$", "$options": "i"}})


# ── GET /clients/by-email?email=...  ─────────────────────────
@router.get("/clients/by-email")
async def get_client_by_email(
    email: str,
    actor: dict = Depends(require_role("user")),
):
    """Look up a client by email. Returns id, name, email (no password)."""
    client = await _find_by_email(clients_collection, email)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return {
        "user_id": str(client["_id"]),
        "name": client.get("name", ""),
        "email": client["email"],
    }


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
    """Insert a new user document into the *users* collection."""

    normalized_email = _normalize_email(payload.email)
    existing = await _find_by_email(users_collection, normalized_email)
    if existing or await _find_by_email(clients_collection, normalized_email):
        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "name": payload.name,
        "email": normalized_email,
        "password": hash_password(payload.password),
        "role": "user",
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        result = await users_collection.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc["_id"] = result.inserted_id
    token = create_access_token(
        subject=str(doc["_id"]),
        role="user",
        email=normalized_email,
    )

    return {
        "success": True,
        "user_id": str(doc["_id"]),
        "name": payload.name,
        "email": normalized_email,
        "role": "user",
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
    }


# ── POST /register/client ────────────────────────────────────
@router.post("/register/client")
async def register_client(payload: RegisterClientBody):
    """Insert a new client document into the *clients* collection."""

    normalized_email = _normalize_email(payload.email)
    existing = await _find_by_email(clients_collection, normalized_email)
    if existing or await _find_by_email(users_collection, normalized_email):
        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "name": payload.name,
        "email": normalized_email,
        "password": hash_password(payload.password),
        "role": "client",
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        result = await clients_collection.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc["_id"] = result.inserted_id

    token = create_access_token(
        subject=str(doc["_id"]),
        role="client",
        email=normalized_email,
    )

    return {
        "success": True,
        "user_id": str(doc["_id"]),
        "name": payload.name,
        "email": normalized_email,
        "role": "client",
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
    }


# ── POST /login/user ─────────────────────────────────────────
@router.post("/login/user")
async def login_user(payload: LoginBody):
    """Validate user credentials and return user info (no JWT)."""
    normalized_email = _normalize_email(payload.email)
    user = await _find_by_email(users_collection, normalized_email)
    if not user:
        await _find_by_email(clients_collection, normalized_email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, str(user.get("password") or "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not str(user.get("password") or "").startswith("pbkdf2_sha256$"):
        await users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"password": hash_password(payload.password)}},
        )

    token = create_access_token(
        subject=str(user["_id"]),
        role="user",
        email=user["email"],
    )

    return {
        "success": True,
        "user_id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user["email"],
        "role": "user",
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
    }


# ── POST /login/client ───────────────────────────────────────
@router.post("/login/client")
async def login_client(payload: LoginBody):
    """Validate client credentials and return client info (no JWT)."""
    normalized_email = _normalize_email(payload.email)
    client = await _find_by_email(clients_collection, normalized_email)
    if not client:
        await _find_by_email(users_collection, normalized_email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, str(client.get("password") or "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not str(client.get("password") or "").startswith("pbkdf2_sha256$"):
        await clients_collection.update_one(
            {"_id": client["_id"]},
            {"$set": {"password": hash_password(payload.password)}},
        )

    token = create_access_token(
        subject=str(client["_id"]),
        role="client",
        email=client["email"],
    )

    return {
        "success": True,
        "user_id": str(client["_id"]),
        "name": client.get("name", ""),
        "email": client["email"],
        "role": "client",
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
    }
