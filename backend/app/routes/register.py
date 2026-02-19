"""
Registration & login routes for testing MongoDB integration.
No JWT, no hashing — just raw inserts / lookups for demo.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from pymongo.errors import DuplicateKeyError

from app.db.mongo import users_collection, clients_collection

router = APIRouter(tags=["Registration & Login"])


# ── GET /clients/by-email?email=...  ─────────────────────────
@router.get("/clients/by-email")
async def get_client_by_email(email: str):
    """Look up a client by email. Returns id, name, email (no password)."""
    client = await clients_collection.find_one({"email": email})
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

    doc = {
        "name": payload.name,
        "email": payload.email,
        "password": payload.password,       # plain text — demo only
        "role": "user",
        "createdAt": datetime.now(timezone.utc),
    }

    existing = await users_collection.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    await users_collection.insert_one(doc)
    return {"success": True}


# ── POST /register/client ────────────────────────────────────
@router.post("/register/client")
async def register_client(payload: RegisterBody):
    """Insert a new client document into the *clients* collection."""

    doc = {
        "name": payload.name,
        "email": payload.email,
        "password": payload.password,       # plain text — demo only
        "role": "client",
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        await clients_collection.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    return {"success": True}


# ── POST /login/user ─────────────────────────────────────────
@router.post("/login/user")
async def login_user(payload: LoginBody):
    """Validate user credentials and return user info (no JWT)."""
    user = await users_collection.find_one({"email": payload.email})
    if not user or user.get("password") != payload.password:
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
    client = await clients_collection.find_one({"email": payload.email})
    if not client or client.get("password") != payload.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "success": True,
        "user_id": str(client["_id"]),
        "name": client.get("name", ""),
        "email": client["email"],
        "role": "client",
    }
