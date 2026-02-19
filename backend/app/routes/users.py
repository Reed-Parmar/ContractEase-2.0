"""
Routes for the **users** collection.
Handles user registration (no auth yet).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from bson import ObjectId

from app.db.mongo import users_collection
from app.models.user import UserCreate, UserOut

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(payload: UserCreate):
    """Register a new user (contract creator / freelancer)."""

    # Check for duplicate email
    existing = await users_collection.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "name": payload.name,
        "email": payload.email,
        "password": payload.password,  # plain text — acceptable for college demo
        "createdAt": datetime.now(timezone.utc),
    }

    result = await users_collection.insert_one(doc)

    # Return the created user (without password)
    doc["_id"] = str(result.inserted_id)
    return doc
