"""
Routes for the **signatures** collection.
Handles contract signing.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from bson import ObjectId

from app.db.mongo import contracts_collection, signatures_collection
from app.models.signature import SignatureCreate, SignatureOut
from app.models.contract import ContractStatus

router = APIRouter(prefix="/contracts", tags=["Signatures"])


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

    contract = await contracts_collection.find_one({"_id": oid})

    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    if contract["status"] != ContractStatus.sent.value:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot sign — contract status is '{contract['status']}' (must be 'sent')",
        )

    # Create signature document
    sig_doc = {
        "contractId": contract_id,
        "signerName": payload.signerName,
        "signerEmail": payload.signerEmail,
        "signatureImage": payload.signatureImage,
        "signedAt": datetime.now(timezone.utc),
    }

    result = await signatures_collection.insert_one(sig_doc)

    # Update contract status to 'signed'
    await contracts_collection.update_one(
        {"_id": oid},
        {"$set": {"status": ContractStatus.signed.value}},
    )

    sig_doc["_id"] = str(result.inserted_id)
    return sig_doc
