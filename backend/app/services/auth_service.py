"""Business logic for registration and login routes."""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import re

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.core.security import (
    ACCESS_TOKEN_TTL_SECONDS,
    create_access_token,
    hash_password,
    needs_rehash,
    verify_password_with_rehash,
)
from app.db.mongo import clients_collection, users_collection

logger = logging.getLogger(__name__)


def _normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def _safe_create_access_token(subject: str, role: str, email: str) -> str:
    try:
        return create_access_token(subject=subject, role=role, email=email)
    except Exception as exc:
        logger.exception("Access token generation failed for email=%s role=%s", email, role)
        raise HTTPException(status_code=500, detail="Authentication token generation failed") from exc


async def _find_by_email(collection, email: str):
    normalized = _normalize_email(email)
    if not normalized:
        return None

    exact = await collection.find_one({"email": normalized})
    if exact:
        return exact

    escaped = re.escape(normalized)
    return await collection.find_one({"email": {"$regex": f"^{escaped}$", "$options": "i"}})


async def get_client_by_email(email: str) -> dict:
    client = await _find_by_email(clients_collection, email)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return {
        "user_id": str(client["_id"]),
        "name": client.get("name", ""),
        "email": client["email"],
    }


async def register_user(payload) -> dict:
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
    except DuplicateKeyError as exc:
        logger.warning("Duplicate user registration attempted for %s", normalized_email)
        raise HTTPException(status_code=400, detail="Email already registered") from exc
    except Exception as exc:
        logger.exception("Unexpected user registration error for %s", normalized_email)
        raise HTTPException(status_code=500, detail="Unexpected registration error") from exc

    doc["_id"] = result.inserted_id
    token = _safe_create_access_token(subject=str(doc["_id"]), role="user", email=normalized_email)
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


async def register_client(payload) -> dict:
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
    except DuplicateKeyError as exc:
        logger.warning("Duplicate client registration attempted for %s", normalized_email)
        raise HTTPException(status_code=400, detail="Email already registered") from exc
    except Exception as exc:
        logger.exception("Unexpected client registration error for %s", normalized_email)
        raise HTTPException(status_code=500, detail="Unexpected registration error") from exc

    doc["_id"] = result.inserted_id
    token = _safe_create_access_token(subject=str(doc["_id"]), role="client", email=normalized_email)
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


async def login_user(payload) -> dict:
    normalized_email = _normalize_email(payload.email)
    user = await _find_by_email(users_collection, normalized_email)
    if not user:
        await _find_by_email(clients_collection, normalized_email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    verified, replacement_hash = verify_password_with_rehash(payload.password, str(user.get("password") or ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if replacement_hash and needs_rehash(str(user.get("password") or "")):
        await users_collection.update_one({"_id": user["_id"]}, {"$set": {"password": replacement_hash}})

    token = _safe_create_access_token(subject=str(user["_id"]), role="user", email=user["email"])
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


async def login_client(payload) -> dict:
    normalized_email = _normalize_email(payload.email)
    client = await _find_by_email(clients_collection, normalized_email)
    if not client:
        await _find_by_email(users_collection, normalized_email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    verified, replacement_hash = verify_password_with_rehash(payload.password, str(client.get("password") or ""))
    if not verified:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if replacement_hash and needs_rehash(str(client.get("password") or "")):
        await clients_collection.update_one({"_id": client["_id"]}, {"$set": {"password": replacement_hash}})

    token = _safe_create_access_token(subject=str(client["_id"]), role="client", email=client["email"])
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
