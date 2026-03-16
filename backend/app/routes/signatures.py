"""
Routes for the **signatures** collection.
Handles contract signing.
"""

from datetime import datetime, timezone
from pathlib import Path
import sys

from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pymongo import ReturnDocument

from app.db.mongo import contracts_collection, signatures_collection, db
from app.models.signature import SignatureCreate, SignatureOut
from app.models.contract import ContractStatus

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from pdf_gen_engine import generate_contract_pdf

router = APIRouter(prefix="/contracts", tags=["Signatures"])


def _build_contract_terms(contract_doc: dict) -> list[str]:
    """Create a simple printable terms list for the PDF template."""
    terms: list[str] = []

    description = str(contract_doc.get("description") or "").strip()
    if description:
        terms.append(description)

    clauses = contract_doc.get("clauses") or {}
    clause_text = {
        "payment": "Payment obligations apply as agreed by both parties.",
        "liability": "Liability limits and responsibilities apply to this agreement.",
        "confidentiality": "Both parties must keep confidential information private.",
        "termination": "Either party may terminate as defined in this contract.",
    }

    for clause_key, text in clause_text.items():
        if clauses.get(clause_key):
            terms.append(text)

    return terms or ["Both parties agree to the terms captured in this contract."]


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
    - Generates and stores a PDF exactly once as part of signing finalization.
    - Creates a signature record and updates contract status to 'signed'.
    """

    # Validate contract ID
    try:
        oid = ObjectId(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract ID format")

    signed_at = datetime.now(timezone.utc)

    # Lock signing so only one request can generate the final PDF.
    locked_contract = await contracts_collection.find_one_and_update(
        {
            "_id": oid,
            "status": ContractStatus.sent.value,
            "$or": [
                {"pdf_path": {"$exists": False}},
                {"pdf_path": None},
                {"pdf_path": ""},
            ],
        },
        {"$set": {"status": ContractStatus.pending.value}},
        return_document=ReturnDocument.AFTER,
    )

    if locked_contract is None:
        # Distinguish "not found" from "wrong status"
        existing = await contracts_collection.find_one({"_id": oid})
        if not existing:
            raise HTTPException(status_code=404, detail="Contract not found")

        if existing.get("status") == ContractStatus.signed.value and existing.get("pdf_path"):
            raise HTTPException(status_code=400, detail="Contract is already signed")

        raise HTTPException(
            status_code=400,
            detail=f"Cannot sign — contract status is '{existing['status']}' (must be 'sent')",
        )

    # Create signature document only after the atomic status change succeeded
    sig_doc = {
        "contractId": oid,
        "signerName": payload.signerName,
        "signerEmail": payload.signerEmail,
        "signatureImage": payload.signatureImage,
        "signedAt": signed_at,
    }

    result = await signatures_collection.insert_one(sig_doc)

    contract_payload = {
        "contract_id": str(locked_contract["_id"]),
        "title": locked_contract.get("title") or "Service Agreement",
        "description": locked_contract.get("description") or "",
        "clauses": locked_contract.get("clauses") or {},
        "creator_name": locked_contract.get("userName")
        or locked_contract.get("userEmail")
        or "Creator",
        "client_name": locked_contract.get("clientName")
        or locked_contract.get("clientEmail")
        or payload.signerName,
        "amount": locked_contract.get("amount") or "",
        "due_date": locked_contract.get("dueDate"),
        "signed_date": signed_at,
        "contract_terms": _build_contract_terms(locked_contract),
        "signature_client": payload.signatureImage,
        "signature_creator": "",
    }

    try:
        pdf_path = generate_contract_pdf(contract_payload)
    except Exception as error:
        print(f"PDF generation failed for signed contract {contract_id}: {error}")
        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {"$set": {"status": ContractStatus.sent.value, "signedAt": None}},
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate signed contract PDF.",
        )

    await contracts_collection.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": ContractStatus.signed.value,
                "signedAt": signed_at,
                "pdf_path": pdf_path,
            }
        },
    )

    sig_doc["_id"] = str(result.inserted_id)
    sig_doc["contractId"] = str(sig_doc["contractId"])
    return sig_doc


# ── GET /contracts/{id}/signature  ───────────────────────────
@router.get("/{contract_id}/signature")
async def get_contract_signature(contract_id: str):
    """Retrieve the stored signature record for a signed contract."""
    try:
        oid = ObjectId(contract_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contract ID format")

    sig = await signatures_collection.find_one({
        "$or": [
            {"contractId": oid},
            {"contractId": contract_id},  # legacy records created before ObjectId migration
        ]
    })
    if not sig:
        raise HTTPException(status_code=404, detail="No signature found for this contract")
    sig["_id"] = str(sig["_id"])
    if isinstance(sig.get("contractId"), ObjectId):
        sig["contractId"] = str(sig["contractId"])
    return sig
