"""
Routes for the **clients** collection.
Handles client registration.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from bson import ObjectId

from app.db.mongo import clients_collection
from app.models.client import ClientCreate, ClientOut

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.post("/", response_model=ClientOut, status_code=201)
async def create_client(payload: ClientCreate):
    """Register a new client (contract signer)."""

    # Check for duplicate email
    existing = await clients_collection.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "name": payload.name,
        "email": payload.email,
        "createdAt": datetime.now(timezone.utc),
    }

    result = await clients_collection.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc
