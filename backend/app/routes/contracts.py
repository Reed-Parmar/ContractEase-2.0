"""
Routes for the **contracts** collection.
Handles creation, retrieval, and status updates.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from bson import ObjectId

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
        "userId": payload.userId,
        "clientId": payload.clientId,
        "createdAt": datetime.now(timezone.utc),
    }

    result = await contracts_collection.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


# ── GET /contracts/{id}  ──────────────────────────────────────
@router.get("/{contract_id}", response_model=ContractOut)
async def get_contract(contract_id: str):
    """Retrieve a single contract by its ID."""

    oid = _validate_object_id(contract_id, "contract")
    doc = await contracts_collection.find_one({"_id": oid})

    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    doc["_id"] = str(doc["_id"])
    return doc


# ── PUT /contracts/{id}/send  ─────────────────────────────────
@router.put("/{contract_id}/send", response_model=ContractOut)
async def send_contract(contract_id: str):
    """
    Mark a contract as 'sent'.
    Only drafts can be sent.
    """

    oid = _validate_object_id(contract_id, "contract")
    doc = await contracts_collection.find_one({"_id": oid})

    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    if doc["status"] != ContractStatus.draft.value:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send — contract status is '{doc['status']}' (must be 'draft')",
        )

    await contracts_collection.update_one(
        {"_id": oid},
        {"$set": {"status": ContractStatus.sent.value}},
    )

    doc["status"] = ContractStatus.sent.value
    doc["_id"] = str(doc["_id"])
    return doc
