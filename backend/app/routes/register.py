"""
Registration & login routes for testing MongoDB integration.
No JWT, no hashing — just raw inserts / lookups for demo.
"""

from datetime import datetime, timezone
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from pymongo.errors import DuplicateKeyError

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
async def get_client_by_email(email: str):
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
    name: str
    email: EmailStr
    password: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


# ── POST /register/user ──────────────────────────────────────
@router.post("/register/user")
async def register_user(payload: RegisterBody):
    """Insert a new user document into the *users* collection."""

    normalized_email = _normalize_email(payload.email)
    existing = await _find_by_email(users_collection, normalized_email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "name": payload.name,
        "email": normalized_email,
        "password": payload.password,       # plain text — demo only
        "role": "user",
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        result = await users_collection.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc["_id"] = result.inserted_id
    return {
        "success": True,
        "user_id": str(doc["_id"]),
        "name": payload.name,
        "email": normalized_email,
        "role": "user",
    }


# ── POST /register/client ────────────────────────────────────
@router.post("/register/client")
async def register_client(payload: RegisterBody):
    """Insert a new client document into the *clients* collection."""

    normalized_email = _normalize_email(payload.email)
    existing = await _find_by_email(clients_collection, normalized_email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "name": payload.name,
        "email": normalized_email,
        "password": payload.password,       # plain text — demo only
        "role": "client",
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        result = await clients_collection.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc["_id"] = result.inserted_id

    return {
        "success": True,
        "user_id": str(doc["_id"]),
        "name": payload.name,
        "email": normalized_email,
        "role": "client",
    }


# ── POST /login/user ─────────────────────────────────────────
@router.post("/login/user")
async def login_user(payload: LoginBody):
    """Validate user credentials and return user info (no JWT)."""
    normalized_email = _normalize_email(payload.email)
    user = await _find_by_email(users_collection, normalized_email)
    if not user:
        client = await _find_by_email(clients_collection, normalized_email)
        if client:
            raise HTTPException(status_code=400, detail="This email belongs to a client account. Please use Client Login.")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("password") != payload.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "success": True,
        "user_id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user["email"],
        "role": "user",
    }


# ── POST /login/client ───────────────────────────────────────
@router.post("/login/client")
async def login_client(payload: LoginBody):
    """Validate client credentials and return client info (no JWT)."""
    normalized_email = _normalize_email(payload.email)
    client = await _find_by_email(clients_collection, normalized_email)
    if not client:
        user = await _find_by_email(users_collection, normalized_email)
        if user:
            raise HTTPException(status_code=400, detail="This email belongs to a user account. Please use User Login.")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if client.get("password") != payload.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "success": True,
        "user_id": str(client["_id"]),
        "name": client.get("name", ""),
        "email": client["email"],
        "role": "client",
    }
