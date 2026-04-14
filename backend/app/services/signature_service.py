"""Business logic for signature routes."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument

from app.db.mongo import contracts_collection, db, signatures_collection
from app.models.contract import ContractStatus
from app.models.signature import SignatureCreate

logger = logging.getLogger(__name__)

PENDING_LOCK_TTL = timedelta(minutes=5)
DEFAULT_CURRENCY = "₹"
HOUSE_SALE_TYPE = "house_sale"
WEBSITE_DEVELOPMENT_TYPE = "website_development"
BROKER_TYPE = "broker"
NDA_TYPE = "nda"
EMPLOYMENT_TYPE = "employment"
SUPPORTED_CONTRACT_TYPES = {
    HOUSE_SALE_TYPE,
    WEBSITE_DEVELOPMENT_TYPE,
    BROKER_TYPE,
    NDA_TYPE,
    EMPLOYMENT_TYPE,
}


def _build_contract_terms(contract_doc: dict) -> list[str]:
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


async def ensure_signature_indexes() -> None:
    collection_names = await db.list_collection_names()
    if "signatures" not in collection_names:
        await db.create_collection("signatures")

    await signatures_collection.create_index("contractId")
    await signatures_collection.create_index("signedAt")
    await contracts_collection.create_index("pendingAt")
    await cleanup_stale_pending_contracts()


async def sign_contract(contract_id: str, payload: SignatureCreate, actor: dict) -> dict:
    try:
        oid = ObjectId(contract_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid contract ID format") from exc

    actor_id = str(actor.get("sub") or "")
    try:
        actor_oid = ObjectId(actor_id)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication context") from exc

    actor_email = str(actor.get("email") or "").strip().lower()
    payload_email = str(payload.signerEmail).strip().lower()
    if actor_email and payload_email != actor_email:
        raise HTTPException(status_code=403, detail="Signer email must match authenticated account")

    signed_at = datetime.now(timezone.utc)
    stale_before = signed_at - PENDING_LOCK_TTL
    await cleanup_stale_pending_contracts(signed_at)

    locked_contract = await contracts_collection.find_one_and_update(
        {
            "_id": oid,
            "clientId": actor_oid,
            "$and": [
                {
                    "$or": [
                        {"status": ContractStatus.sent.value},
                        {"status": ContractStatus.pending.value, "pendingAt": {"$lte": stale_before}},
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

        raise HTTPException(status_code=400, detail=f"Cannot sign — contract status is '{existing['status']}' (must be 'sent')")

    assigned_client_email = str(locked_contract.get("clientEmail") or "").strip().lower()
    requester_signer_email = str(payload.signerEmail).strip().lower()
    if assigned_client_email and requester_signer_email != assigned_client_email:
        await contracts_collection.update_one(
            {"_id": oid},
            {"$set": {"status": ContractStatus.sent.value, "signedAt": None, "pendingAt": None}},
        )
        raise HTTPException(status_code=403, detail="Signer does not match assigned client")

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
    if contract_type == HOUSE_SALE_TYPE:
        house_sale = ((locked_contract.get("templateData") or {}).get("houseSale") or {})
        if house_sale.get("sale_price") is not None:
            amount_value = house_sale.get("sale_price")
    signature_fields = locked_contract.get("signatures") or {}

    if not str(signature_fields.get("creator") or "").strip():
        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {"$set": {"status": ContractStatus.sent.value, "signedAt": None, "pendingAt": None}},
        )
        raise HTTPException(status_code=400, detail="Creator signature is missing from this contract")

    contract_payload = {
        "type": contract_type if contract_type in SUPPORTED_CONTRACT_TYPES else "",
        "templateData": locked_contract.get("templateData") or {},
        "contract_id": str(locked_contract["_id"]),
        "title": locked_contract.get("title") or "Contract",
        "description": locked_contract.get("description") or "",
        "clauses": locked_contract.get("clauses") or {},
        "creator_name": locked_contract.get("userName") or locked_contract.get("userEmail") or "Creator",
        "client_name": locked_contract.get("clientName") or locked_contract.get("clientEmail") or payload.signerName,
        "amount": amount_value if amount_value is not None else None,
        "currency": locked_contract.get("currency") or DEFAULT_CURRENCY,
        "due_date": locked_contract.get("dueDate"),
        "signed_date": signed_at,
        "contract_terms": _build_contract_terms(locked_contract),
        "signature_client": payload.signatureImage,
        "signature_creator": signature_fields.get("creator") or "",
    }

    try:
        try:
            from pdf_gen_engine import generate_contract_pdf
        except ImportError as import_error:
            raise HTTPException(
                status_code=500,
                detail="PDF generator unavailable; ensure pdf_gen_engine is installed and importable",
            ) from import_error
        pdf_path = await asyncio.to_thread(generate_contract_pdf, contract_payload)
    except ValueError as error:
        logger.warning("PDF validation failed for signed contract %s: %s", contract_id, error)
        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {"$set": {"status": ContractStatus.sent.value, "signedAt": None, "pendingAt": None}},
        )
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("PDF generation failed for signed contract %s", contract_id)
        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {"$set": {"status": ContractStatus.sent.value, "signedAt": None, "pendingAt": None}},
        )
        raise HTTPException(status_code=500, detail="Failed to generate signed contract PDF.") from error

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
        logger.exception("Failed to persist signed contract state for %s", contract_id)

        try:
            pdf_file = Path(str(pdf_path))
            if pdf_file.exists():
                await asyncio.to_thread(pdf_file.unlink)
        except Exception:
            logger.exception("Failed to delete generated PDF during rollback for %s", contract_id)

        await signatures_collection.delete_one({"_id": result.inserted_id})
        await contracts_collection.update_one(
            {"_id": oid},
            {"$set": {"status": ContractStatus.sent.value, "signedAt": None, "pendingAt": None}},
        )
        raise HTTPException(status_code=500, detail=f"Failed to persist contract state: {error}") from error

    sig_doc["_id"] = str(result.inserted_id)
    sig_doc["contractId"] = str(sig_doc["contractId"])
    return sig_doc


async def get_contract_signature(contract_id: str, actor: dict) -> dict:
    try:
        oid = ObjectId(contract_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid contract ID format") from exc

    contract_doc = await contracts_collection.find_one({"_id": oid}, {"userId": 1, "clientId": 1})
    if not contract_doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    actor_id = str(actor.get("sub") or "")
    if str(contract_doc.get("userId") or "") != actor_id and str(contract_doc.get("clientId") or "") != actor_id:
        raise HTTPException(status_code=403, detail="You do not have access to this signature")

    sig = await signatures_collection.find_one(
        {
            "$or": [
                {"contractId": oid},
                {"contractId": contract_id},
            ]
        }
    )
    if not sig:
        raise HTTPException(status_code=404, detail="No signature found for this contract")
    sig["_id"] = str(sig["_id"])
    if isinstance(sig.get("contractId"), ObjectId):
        sig["contractId"] = str(sig["contractId"])
    return sig
