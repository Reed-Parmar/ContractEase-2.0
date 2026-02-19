"""
Routes for the **clients** collection.
Handles client registration.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.db.mongo import clients_collection
from app.models.client import ClientCreate, ClientOut

router = APIRouter(prefix="/clients", tags=["Clients"])


# Ensure a unique index on email so the DB enforces uniqueness
@router.on_event("startup")
async def _ensure_indexes():
    await clients_collection.create_index("email", unique=True)


@router.post("/", response_model=ClientOut, status_code=201)
async def create_client(payload: ClientCreate):
    """Register a new client (contract signer)."""

    doc = {
        "name": payload.name,
        "email": payload.email,
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        result = await clients_collection.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc["_id"] = str(result.inserted_id)
    return doc
