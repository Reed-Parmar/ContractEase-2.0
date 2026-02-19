"""
Routes for the **contracts** collection.
Handles creation, retrieval, and status updates.
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel
from pymongo import ReturnDocument

from app.db.mongo import contracts_collection, users_collection, clients_collection
from app.models.contract import ContractCreate, ContractOut, ContractStatus

router = APIRouter(prefix="/contracts", tags=["Contracts"])


# ── Helper ────────────────────────────────────────────────────
def _validate_object_id(value: str, label: str) -> ObjectId:
    """Convert a string to ObjectId or raise 400."""
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {label} ID format")


def _serialize(doc: dict) -> dict:
    """Stringify ObjectId fields for JSON output."""
    doc["_id"] = str(doc["_id"])
    if isinstance(doc.get("userId"), ObjectId):
        doc["userId"] = str(doc["userId"])
    if isinstance(doc.get("clientId"), ObjectId):
        doc["clientId"] = str(doc["clientId"])
    return doc


# ── POST /contracts  ──────────────────────────────────────────
@router.post("/", response_model=ContractOut, status_code=201)
async def create_contract(payload: ContractCreate):
    """Create a new contract in 'draft' status."""

    # Validate referenced user exists
    user_oid = _validate_object_id(payload.userId, "user")
    user = await users_collection.find_one({"_id": user_oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate referenced client exists
    client_oid = _validate_object_id(payload.clientId, "client")
    client = await clients_collection.find_one({"_id": client_oid})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    doc = {
        "title": payload.title,
        "type": payload.type,
        "description": payload.description,
        "amount": payload.amount,
        "dueDate": payload.dueDate,
        "clauses": payload.clauses.model_dump(),
        "status": ContractStatus.draft.value,
        "userId": user_oid,
        "clientId": client_oid,
        "clientName": client.get("name", ""),
        "clientEmail": client.get("email", ""),
        "createdAt": datetime.now(timezone.utc),
        "signedAt": None,
    }

    result = await contracts_collection.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    # Convert ObjectIds back to strings for the response
    doc["userId"] = str(doc["userId"])
    doc["clientId"] = str(doc["clientId"])
    return doc


# ── GET /contracts/user/{userId}  ─────────────────────────────
@router.get("/user/{user_id}", response_model=List[ContractOut])
async def get_contracts_by_user(user_id: str):
    """Return all contracts created by a given user."""
    user_oid = _validate_object_id(user_id, "user")
    cursor = contracts_collection.find({"userId": user_oid}).sort("createdAt", -1)
    results = []
    async for doc in cursor:
        results.append(_serialize(doc))
    return results


# ── GET /contracts/client/{clientId}  ──────────────────────────
@router.get("/client/{client_id}", response_model=List[ContractOut])
async def get_contracts_by_client(client_id: str):
    """Return all contracts assigned to a given client."""
    client_oid = _validate_object_id(client_id, "client")
    cursor = contracts_collection.find({"clientId": client_oid}).sort("createdAt", -1)
    results = []
    async for doc in cursor:
        results.append(_serialize(doc))
    return results


# ── GET /contracts/{id}  ──────────────────────────────────────
@router.get("/{contract_id}", response_model=ContractOut)
async def get_contract(contract_id: str):
    """Retrieve a single contract by its ID."""

    oid = _validate_object_id(contract_id, "contract")
    doc = await contracts_collection.find_one({"_id": oid})

    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    return _serialize(doc)


# ── PATCH /contracts/{id}/status  ─────────────────────────────
class StatusUpdate(BaseModel):
    status: ContractStatus


@router.patch("/{contract_id}/status", response_model=ContractOut)
async def update_contract_status(contract_id: str, payload: StatusUpdate):
    """
    Transition a contract to a new status.
    Allowed transitions:
        draft   → sent / pending
        sent    → signed / declined
        pending → signed / declined
    """
    oid = _validate_object_id(contract_id, "contract")

    ALLOWED_TRANSITIONS = {
        "draft": {"sent", "pending"},
        "sent": {"signed", "declined"},
        "pending": {"signed", "declined"},
    }

    existing = await contracts_collection.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Contract not found")

    current = existing["status"]
    target = payload.status.value
    allowed = ALLOWED_TRANSITIONS.get(current, set())

    if target not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{current}' to '{target}'",
        )

    update_fields: dict = {"status": target}
    if target == "signed":
        update_fields["signedAt"] = datetime.now(timezone.utc)

    result = await contracts_collection.find_one_and_update(
        {"_id": oid},
        {"$set": update_fields},
        return_document=ReturnDocument.AFTER,
    )

    return _serialize(result)


# ── PUT /contracts/{id}/send  ─────────────────────────────────
@router.put("/{contract_id}/send", response_model=ContractOut)
async def send_contract(contract_id: str):
    """
    Mark a contract as 'sent'.
    Only drafts can be sent.
    """

    oid = _validate_object_id(contract_id, "contract")

    # Atomic conditional update: only transition draft → sent
    result = await contracts_collection.find_one_and_update(
        {"_id": oid, "status": ContractStatus.draft.value},
        {"$set": {"status": ContractStatus.sent.value}},
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        # Distinguish "not found" from "wrong status"
        existing = await contracts_collection.find_one({"_id": oid})
        if not existing:
            raise HTTPException(status_code=404, detail="Contract not found")
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send — contract status is '{existing['status']}' (must be 'draft')",
        )

    return _serialize(result)
