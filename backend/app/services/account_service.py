"""Business logic for user and client registration routes."""

from __future__ import annotations

from datetime import datetime, timezone
import logging

from pymongo.errors import DuplicateKeyError

from app.core.security import hash_password
from app.db.mongo import clients_collection, users_collection

logger = logging.getLogger(__name__)


async def ensure_client_indexes() -> None:
    await clients_collection.create_index("email", unique=True)


async def ensure_user_indexes() -> None:
    await users_collection.create_index("email", unique=True)


async def create_user(payload) -> dict:
    existing = await users_collection.find_one({"email": payload.email})
    if existing:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "name": payload.name,
        "email": payload.email,
        "password": hash_password(payload.password),
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        result = await users_collection.insert_one(doc)
    except DuplicateKeyError as exc:
        logger.warning("Duplicate user registration attempted for %s", payload.email)
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Email already registered") from exc

    doc["_id"] = str(result.inserted_id)
    doc.pop("password", None)
    return doc


async def create_client(payload) -> dict:
    doc = {
        "name": payload.name,
        "email": payload.email,
        "password": hash_password(payload.password),
        "role": "client",
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        result = await clients_collection.insert_one(doc)
    except DuplicateKeyError as exc:
        logger.warning("Duplicate client registration attempted for %s", payload.email)
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Email already registered") from exc

    doc["_id"] = str(result.inserted_id)
    doc["role"] = "client"
    doc.pop("password", None)
    return doc
