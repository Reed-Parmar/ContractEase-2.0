"""
Routes for the **signatures** collection.
Handles contract signing.
"""

import asyncio
from datetime import datetime, timedelta, timezone
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

PENDING_LOCK_TTL = timedelta(minutes=5)
DEFAULT_CURRENCY = "₹"


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


async def cleanup_stale_pending_contracts(now: datetime | None = None) -> int:
    """Reset stale pending contracts so they can be signed again."""
    current_time = now or datetime.now(timezone.utc)
    stale_before = current_time - PENDING_LOCK_TTL
    result = await contracts_collection.update_many(
        {
            "status": ContractStatus.pending.value,
            "$and": [
                {
                    "$or": [
                        {"pendingAt": {"$lte": stale_before}},
                        {"pendingAt": {"$exists": False}},
                        {"pendingAt": None},
                    ]
                },
                {
                    "$or": [
                        {"pdf_path": {"$exists": False}},
                        {"pdf_path": None},
                        {"pdf_path": ""},
                    ]
                },
            ],
        },
        {
            "$set": {
                "status": ContractStatus.sent.value,
                "pendingAt": None,
                "signedAt": None,
            }
        },
    )
    return result.modified_count


@router.on_event("startup")
async def _ensure_signatures_collection() -> None:
    """Ensure signatures collection exists so it is visible in MongoDB tooling."""
    collection_names = await db.list_collection_names()
    if "signatures" not in collection_names:
        await db.create_collection("signatures")

    await signatures_collection.create_index("contractId")
    await signatures_collection.create_index("signedAt")
    await contracts_collection.create_index("pendingAt")
    await cleanup_stale_pending_contracts()


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
    stale_before = signed_at - PENDING_LOCK_TTL
    await cleanup_stale_pending_contracts(signed_at)

    # Lock signing so only one request can generate the final PDF.
    locked_contract = await contracts_collection.find_one_and_update(
        {
            "_id": oid,
            "$and": [
                {
                    "$or": [
                        {"status": ContractStatus.sent.value},
                        {
                            "status": ContractStatus.pending.value,
                            "pendingAt": {"$lte": stale_before},
                        },
                    ]
                },
                {
                    "$or": [
                        {"pdf_path": {"$exists": False}},
                        {"pdf_path": None},
                        {"pdf_path": ""},
                    ]
                },
            ],
        },
        {
            "$set": {
                "status": ContractStatus.pending.value,
                "pendingAt": signed_at,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if locked_contract is None:
        # Distinguish "not found" from "wrong status"
        existing = await contracts_collection.find_one({"_id": oid})
        if not existing:
            raise HTTPException(status_code=404, detail="Contract not found")

        existing_signatures = existing.get("signatures") or {}
        if not str(existing_signatures.get("creator") or "").strip():
            raise HTTPException(status_code=400, detail="Creator signature is missing from this contract")

        if existing.get("status") == ContractStatus.signed.value and existing.get("pdf_path"):
            raise HTTPException(status_code=400, detail="Contract is already signed")

        if existing.get("status") == ContractStatus.pending.value:
            raise HTTPException(status_code=409, detail="Contract signing is already in progress")

        raise HTTPException(
            status_code=400,
            detail=f"Cannot sign — contract status is '{existing['status']}' (must be 'sent')",
        )

    assigned_client_email = str(locked_contract.get("clientEmail") or "").strip().lower()
    requester_signer_email = str(payload.signerEmail).strip().lower()
    if assigned_client_email and requester_signer_email != assigned_client_email:
        await contracts_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": ContractStatus.sent.value,
                    "signedAt": None,
                    "pendingAt": None,
                }
            },
        )
        raise HTTPException(status_code=403, detail="Signer does not match assigned client")

    # Create signature document only after the atomic status change succeeded
    sig_doc = {
        "contractId": oid,
        "signerName": payload.signerName,
        "signerEmail": payload.signerEmail,
        "signatureImage": payload.signatureImage,
        "signatureType": payload.signatureType,
        "signedAt": signed_at,
    }

    result = await signatures_collection.insert_one(sig_doc)

    amount_value = locked_contract.get("amount")
    contract_type = str(locked_contract.get("type") or "").strip().lower()
    if contract_type == "house_sale":
        house_sale = ((locked_contract.get("templateData") or {}).get("houseSale") or {})
        if house_sale.get("sale_price") is not None:
            amount_value = house_sale.get("sale_price")
    signature_fields = locked_contract.get("signatures") or {}

    if not str(signature_fields.get("creator") or "").strip():
        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": ContractStatus.sent.value,
                    "signedAt": None,
                    "pendingAt": None,
                }
            },
        )
        raise HTTPException(status_code=400, detail="Creator signature is missing from this contract")

    contract_payload = {
        "type": locked_contract.get("type") or "website_development",
        "templateData": locked_contract.get("templateData") or {},
        "contract_id": str(locked_contract["_id"]),
        "title": locked_contract.get("title") or "Contract",
        "description": locked_contract.get("description") or "",
        "clauses": locked_contract.get("clauses") or {},
        "creator_name": locked_contract.get("userName")
        or locked_contract.get("userEmail")
        or "Creator",
        "client_name": locked_contract.get("clientName")
        or locked_contract.get("clientEmail")
        or payload.signerName,
        "amount": amount_value if amount_value is not None else None,
        "currency": locked_contract.get("currency") or DEFAULT_CURRENCY,
        "due_date": locked_contract.get("dueDate"),
        "signed_date": signed_at,
        "contract_terms": _build_contract_terms(locked_contract),
        "signature_client": payload.signatureImage,
        "signature_creator": signature_fields.get("creator") or "",
    }

    try:
        pdf_path = await asyncio.to_thread(generate_contract_pdf, contract_payload)
    except ValueError as error:
        print(f"PDF validation failed for signed contract {contract_id}: {error}")
        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": ContractStatus.sent.value,
                    "signedAt": None,
                    "pendingAt": None,
                }
            },
        )
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )
    except Exception as error:
        print(f"PDF generation failed for signed contract {contract_id}: {error}")
        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": ContractStatus.sent.value,
                    "signedAt": None,
                    "pendingAt": None,
                }
            },
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate signed contract PDF.",
        )

    try:
        update_result = await contracts_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": ContractStatus.signed.value,
                    "signedAt": signed_at,
                    "pendingAt": None,
                    "pdf_path": pdf_path,
                    "signatures.client": payload.signatureImage,
                }
            },
        )
        if update_result.matched_count == 0:
            raise RuntimeError("Contract record disappeared before signed update could be saved")
    except Exception as error:
        print(f"Failed to persist signed contract state for {contract_id}: {error}")

        try:
            pdf_file = Path(str(pdf_path))
            if pdf_file.exists():
                pdf_file.unlink()
        except Exception as cleanup_error:
            print(f"Failed to delete generated PDF during rollback for {contract_id}: {cleanup_error}")

        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": ContractStatus.sent.value,
                    "signedAt": None,
                    "pendingAt": None,
                }
            },
        )
        raise HTTPException(status_code=500, detail="Failed to generate signed contract PDF.")

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
