"""
Routes for the **signatures** collection.
Handles contract signing.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from bson import ObjectId

from app.db.mongo import contracts_collection, signatures_collection, db
from app.models.signature import SignatureCreate, SignatureOut
from app.models.contract import ContractStatus

router = APIRouter(prefix="/contracts", tags=["Signatures"])


@router.on_event("startup")
async def _ensure_signatures_collection() -> None:
    """Ensure signatures collection exists so it is visible in MongoDB tooling."""
    collection_names = await db.list_collection_names()
    if "signatures" not in collection_names:
        await db.create_collection("signatures")

    await signatures_collection.create_index("contractId")
    await signatures_collection.create_index("signedAt")


# ── POST /contracts/{id}/sign  ────────────────────────────────
@router.post("/{contract_id}/sign", response_model=SignatureOut, status_code=201)
async def sign_contract(contract_id: str, payload: SignatureCreate):
    """
    Sign a contract.
    - Contract must exist and have status 'sent'.
    - Creates a signature record and updates contract status to 'signed'.
    """

    # Validate contract ID
    try:
        oid = ObjectId(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract ID format")

    signed_at = datetime.now(timezone.utc)

    # Atomic conditional update: only transition sent → signed
    updated_contract = await contracts_collection.find_one_and_update(
        {"_id": oid, "status": ContractStatus.sent.value},
        {"$set": {"status": ContractStatus.signed.value, "signedAt": signed_at}},
    )

    if updated_contract is None:
        # Distinguish "not found" from "wrong status"
        existing = await contracts_collection.find_one({"_id": oid})
        if not existing:
            raise HTTPException(status_code=404, detail="Contract not found")
        raise HTTPException(
            status_code=400,
            detail=f"Cannot sign — contract status is '{existing['status']}' (must be 'sent')",
        )

    # Create signature document only after the atomic status change succeeded
    sig_doc = {
        "contractId": contract_id,
        "signerName": payload.signerName,
        "signerEmail": payload.signerEmail,
        "signatureImage": payload.signatureImage,
        "signedAt": signed_at,
    }

    result = await signatures_collection.insert_one(sig_doc)

    sig_doc["_id"] = str(result.inserted_id)
    return sig_doc


# ── GET /contracts/{id}/signature  ───────────────────────────
@router.get("/{contract_id}/signature")
async def get_contract_signature(contract_id: str):
    """Retrieve the stored signature record for a signed contract."""
    sig = await signatures_collection.find_one({"contractId": contract_id})
    if not sig:
        raise HTTPException(status_code=404, detail="No signature found for this contract")
    sig["_id"] = str(sig["_id"])
    return sig
