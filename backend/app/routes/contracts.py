"""
Routes for the **contracts** collection.
Handles creation, retrieval, and status updates.
"""

from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from bson import ObjectId
from pydantic import BaseModel
from pymongo import ReturnDocument

from app.db.mongo import contracts_collection, users_collection, clients_collection, signatures_collection
from app.models.contract import ContractCreate, ContractOut, ContractStatus

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from pdf_gen_engine import generate_contract_pdf
from pdf_gen_engine.config import PDF_STORAGE_PATH

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


def _is_contract_owner(doc: dict, requester_oid: ObjectId, requester_id: str) -> bool:
    """Allow access only to the contract creator or assigned client."""
    owner_ids = [doc.get("userId"), doc.get("clientId")]
    for owner_id in owner_ids:
        if isinstance(owner_id, ObjectId) and owner_id == requester_oid:
            return True
        if owner_id is not None and str(owner_id) == requester_id:
            return True
    return False


def _build_pdf_payload(contract_doc: dict, signature_doc: Optional[dict] = None) -> dict:
    """Build the PDF service payload from a stored contract document."""
    amount_value = contract_doc.get("amount")
    return {
        "contract_id": str(contract_doc["_id"]),
        "title": contract_doc.get("title") or "Service Agreement",
        "description": contract_doc.get("description") or "",
        "clauses": contract_doc.get("clauses") or {},
        "creator_name": contract_doc.get("userName")
        or contract_doc.get("userEmail")
        or "Creator",
        "client_name": contract_doc.get("clientName")
        or contract_doc.get("clientEmail")
        or "Client",
        "amount": amount_value if amount_value is not None else None,
        "due_date": contract_doc.get("dueDate"),
        "signed_date": contract_doc.get("signedAt") or datetime.now(timezone.utc),
        "signature_creator": "",
        "signature_client": (signature_doc or {}).get("signatureImage") or "",
    }


async def _attach_sender_fields(doc: dict) -> dict:
    """Ensure sender name/email are present in contract payloads."""
    if (not doc.get("userName") or not doc.get("userEmail")) and doc.get("userId"):
        sender = await users_collection.find_one(
            {"_id": doc["userId"]},
            {"name": 1, "email": 1},
        )
        if sender:
            doc["userName"] = sender.get("name", "")
            doc["userEmail"] = sender.get("email", "")
    return doc


async def _generate_legacy_pdf_path(contract_id: str, doc: dict) -> str:
    """Regenerate and persist PDFs for older signed contracts missing pdf_path."""
    signature_doc = await signatures_collection.find_one(
        {
            "$or": [
                {"contractId": doc["_id"]},
                {"contractId": contract_id},
            ]
        }
    )
    if not signature_doc:
        raise HTTPException(status_code=404, detail="Signed PDF not available for this contract")

    doc = await _attach_sender_fields(doc)

    try:
        pdf_path = generate_contract_pdf(_build_pdf_payload(doc, signature_doc))
    except Exception as error:
        print(f"Legacy PDF generation failed for contract {contract_id}: {error}")
        raise HTTPException(status_code=500, detail="Failed to generate signed contract PDF.")

    await contracts_collection.update_one(
        {"_id": doc["_id"]},
        {"$set": {"pdf_path": pdf_path}},
    )
    return pdf_path


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
        "userName": user.get("name", ""),
        "userEmail": user.get("email", ""),
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
        doc = await _attach_sender_fields(doc)
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
        doc = await _attach_sender_fields(doc)
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

    doc = await _attach_sender_fields(doc)

    return _serialize(doc)


# ── GET /contracts/{id}/download  ────────────────────────────
@router.get("/{contract_id}/download")
async def download_contract_pdf(
    contract_id: str,
    user_id: str = Query(..., description="Requesting user/client id"),
):
    """Serve a previously generated signed-contract PDF file."""
    contract_oid = _validate_object_id(contract_id, "contract")
    requester_oid = _validate_object_id(user_id, "requesting user")

    doc = await contracts_collection.find_one({"_id": contract_oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    if not _is_contract_owner(doc, requester_oid, user_id):
        raise HTTPException(status_code=403, detail="You do not have access to this contract")

    pdf_path_value = doc.get("pdf_path")
    if not pdf_path_value and doc.get("status") == ContractStatus.signed.value:
        pdf_path_value = await _generate_legacy_pdf_path(contract_id, doc)

    if not pdf_path_value:
        raise HTTPException(status_code=404, detail="Signed PDF not available for this contract")

    storage_root = PDF_STORAGE_PATH.resolve()

    pdf_path = Path(str(pdf_path_value))
    if not pdf_path.is_absolute():
        pdf_path = (storage_root / pdf_path).resolve()
    else:
        pdf_path = pdf_path.resolve()

    try:
        pdf_path.relative_to(storage_root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Stored PDF path is invalid")

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Signed PDF file is missing")

    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        filename=f"contract_{contract_id}.pdf",
    )


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
