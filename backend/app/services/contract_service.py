"""Business logic for contract routes.

This module keeps HTTP concerns out of the route layer while preserving
the current API contract and MongoDB schema.
"""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import re
from pathlib import Path
import sys
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException
from fastapi.responses import FileResponse
from pymongo import ReturnDocument

from app.core.auth import get_current_actor
from app.db.mongo import clients_collection, contracts_collection, signatures_collection, users_collection
from app.models.contract import ContractCreate, ContractOut, ContractStatus

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from pdf_gen_engine import generate_contract_pdf
from pdf_gen_engine.config import PDF_STORAGE_PATH

logger = logging.getLogger(__name__)

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


def _validate_object_id(value: str, label: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:  # pragma: no cover - defensive conversion
        raise HTTPException(status_code=400, detail=f"Invalid {label} ID format") from exc


def _parse_datetime(value):
    if isinstance(value, datetime):
        return value
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        pass

    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])

    raw_amount = doc.get("amount")
    amount_value = 0.0
    if raw_amount is not None:
        try:
            cleaned_amount = re.sub(r"[,$€₹\s]", "", str(raw_amount))
            amount_value = float(cleaned_amount)
        except (TypeError, ValueError):
            amount_value = 0.0
    doc["amount"] = amount_value

    parsed_due = _parse_datetime(doc.get("dueDate"))
    if parsed_due is None:
        parsed_due = _parse_datetime(doc.get("createdAt")) or datetime.now(timezone.utc)
    doc["dueDate"] = parsed_due

    parsed_created = _parse_datetime(doc.get("createdAt"))
    if parsed_created is None:
        parsed_created = datetime.now(timezone.utc)
    doc["createdAt"] = parsed_created

    doc["signedAt"] = _parse_datetime(doc.get("signedAt"))
    doc["currency"] = doc.get("currency") or DEFAULT_CURRENCY
    doc["signatures"] = doc.get("signatures") or {"creator": None, "client": None}
    doc["templateData"] = doc.get("templateData") or {}

    if isinstance(doc.get("userId"), ObjectId):
        doc["userId"] = str(doc["userId"])
    if isinstance(doc.get("clientId"), ObjectId):
        doc["clientId"] = str(doc["clientId"])

    return doc


def _is_contract_owner(doc: dict, requester_oid: ObjectId, requester_id: str) -> bool:
    owner_ids = [doc.get("userId"), doc.get("clientId")]
    for owner_id in owner_ids:
        if isinstance(owner_id, ObjectId) and owner_id == requester_oid:
            return True
        if owner_id is not None and str(owner_id) == requester_id:
            return True
    return False


def _build_pdf_payload(contract_doc: dict, signature_doc: Optional[dict] = None) -> dict:
    amount_value = contract_doc.get("amount")
    contract_type = str(contract_doc.get("type") or "").strip().lower()
    if contract_type == HOUSE_SALE_TYPE:
        house_sale = ((contract_doc.get("templateData") or {}).get("houseSale") or {})
        if house_sale.get("sale_price") is not None:
            amount_value = house_sale.get("sale_price")

    signature_fields = contract_doc.get("signatures") or {}
    return {
        "type": contract_type if contract_type in SUPPORTED_CONTRACT_TYPES else "",
        "templateData": contract_doc.get("templateData") or {},
        "contract_id": str(contract_doc["_id"]),
        "title": contract_doc.get("title") or "Contract",
        "description": contract_doc.get("description") or "",
        "clauses": contract_doc.get("clauses") or {},
        "creator_name": contract_doc.get("userName") or contract_doc.get("userEmail") or "Creator",
        "client_name": contract_doc.get("clientName") or contract_doc.get("clientEmail") or "Client",
        "amount": amount_value if amount_value is not None else None,
        "currency": contract_doc.get("currency") or DEFAULT_CURRENCY,
        "due_date": contract_doc.get("dueDate"),
        "signed_date": contract_doc.get("signedAt") or datetime.now(timezone.utc),
        "signature_creator": signature_fields.get("creator") or "",
        "signature_client": (signature_doc or {}).get("signatureImage")
        or signature_fields.get("client")
        or "",
    }


def _normalize_template_data(payload: ContractCreate) -> dict:
    template_data = payload.templateData
    if template_data is None:
        return {}

    if hasattr(template_data, "model_dump"):
        return template_data.model_dump(exclude_none=True)

    if isinstance(template_data, dict):
        return template_data

    return {}


def _validate_house_sale_data(payload: ContractCreate, template_data: dict) -> float:
    if (payload.type or "").strip().lower() != HOUSE_SALE_TYPE:
        return payload.amount

    house_sale = template_data.get("houseSale") if isinstance(template_data, dict) else None
    if not isinstance(house_sale, dict):
        raise HTTPException(status_code=400, detail="templateData.houseSale is required for house_sale contracts")

    required_fields = {
        "vendor_name": "Vendor name is required for house sale contracts",
        "purchaser_name": "Purchaser name is required for house sale contracts",
        "property_details": "Property details are required for house sale contracts",
        "sale_price": "Sale price is required for house sale contracts",
    }

    for field_name, message in required_fields.items():
        value = house_sale.get(field_name)
        if value is None:
            raise HTTPException(status_code=400, detail=message)
        if isinstance(value, str) and not value.strip():
            raise HTTPException(status_code=400, detail=message)

    try:
        sale_price = float(house_sale.get("sale_price"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Sale price must be a number for house sale contracts")

    if sale_price <= 0:
        raise HTTPException(status_code=400, detail="Sale price must be greater than 0 for house sale contracts")

    property_details = str(house_sale.get("property_details") or "").strip()
    if len(property_details) <= 10:
        raise HTTPException(status_code=400, detail="Property details must be longer than 10 characters")

    earnest_money_raw = house_sale.get("earnest_money_amount")
    if earnest_money_raw is not None and str(earnest_money_raw).strip() != "":
        try:
            earnest_money = float(earnest_money_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Earnest money amount must be a number")

        if earnest_money < 0:
            raise HTTPException(status_code=400, detail="Earnest money amount cannot be negative")

        if earnest_money > sale_price:
            raise HTTPException(status_code=400, detail="Earnest money amount cannot exceed sale price")

    return sale_price


def _validate_website_development_data(payload: ContractCreate, template_data: dict) -> float:
    if (payload.type or "").strip().lower() != WEBSITE_DEVELOPMENT_TYPE:
        return payload.amount

    website_development = template_data.get("websiteDevelopment") if isinstance(template_data, dict) else None
    if not isinstance(website_development, dict):
        raise HTTPException(
            status_code=400,
            detail="templateData.websiteDevelopment is required for website_development contracts",
        )

    required_text_fields = {
        "company_name": "website_development contracts require company name",
        "developer_name": "website_development contracts require developer name",
        "company_address": "website_development contracts require company address",
        "developer_address": "website_development contracts require developer address",
        "project_purpose": "website_development contracts require project purpose",
    }

    for field_name, message in required_text_fields.items():
        value = str(website_development.get(field_name) or "").strip()
        if not value:
            raise HTTPException(status_code=400, detail=message)

    fee_total_raw = website_development.get("fee_total")
    try:
        fee_total = float(fee_total_raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="website_development contracts require numeric fee_total")

    if fee_total <= 0:
        raise HTTPException(status_code=400, detail="website_development fee_total must be greater than 0")

    milestone_fields = ["initial_payment_amount", "mid_payment_amount", "completion_payment_amount"]
    milestones = []
    for field_name in milestone_fields:
        value_raw = website_development.get(field_name)
        try:
            value = float(value_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"website_development contracts require numeric {field_name}")
        if value < 0:
            raise HTTPException(status_code=400, detail=f"website_development {field_name} cannot be negative")
        milestones.append(value)

    if abs(sum(milestones) - fee_total) > 2.0:
        raise HTTPException(status_code=400, detail="website_development milestone payments must add up to fee_total")

    for field_name in ("page_count", "web_page_word_count", "content_due_days", "maintenance_months"):
        value_raw = website_development.get(field_name)
        try:
            numeric_value = float(value_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"website_development contracts require numeric {field_name}")
        if not numeric_value.is_integer():
            raise HTTPException(status_code=400, detail=f"website_development {field_name} must be a whole number")
        value = int(numeric_value)
        if value <= 0:
            raise HTTPException(status_code=400, detail=f"website_development {field_name} must be greater than 0")

    for field_name in ("external_links_per_page", "photo_graphics_average"):
        value_raw = website_development.get(field_name)
        try:
            value = float(value_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"website_development contracts require numeric {field_name}")
        if value < 0:
            raise HTTPException(status_code=400, detail=f"website_development {field_name} cannot be negative")

    return payload.amount


def _validate_broker_data(payload: ContractCreate, template_data: dict) -> float:
    if (payload.type or "").strip().lower() != BROKER_TYPE:
        return payload.amount

    broker = template_data.get("brokerAgreement") if isinstance(template_data, dict) else None
    if not isinstance(broker, dict):
        raise HTTPException(status_code=400, detail="templateData.brokerAgreement is required for broker contracts")

    required_text_fields = {
        "owner_name": "broker contracts require owner name",
        "broker_name": "broker contracts require broker name",
        "owner_residence": "broker contracts require owner residence",
        "broker_residence": "broker contracts require broker residence",
        "property_details": "broker contracts require property details",
    }

    for field_name, message in required_text_fields.items():
        value = str(broker.get(field_name) or "").strip()
        if not value:
            raise HTTPException(status_code=400, detail=message)

    property_details = str(broker.get("property_details") or "").strip()
    if len(property_details) <= 10:
        raise HTTPException(status_code=400, detail="broker property_details must be longer than 10 characters")

    numeric_fields = {
        "total_consideration": True,
        "earnest_money_amount": False,
        "commission_rate": False,
        "completion_period_months": True,
        "broker_sale_period_months": True,
    }

    parsed_numeric = {}
    for field_name, must_be_positive in numeric_fields.items():
        value_raw = broker.get(field_name)
        try:
            value = float(value_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"broker contracts require numeric {field_name}")

        if must_be_positive and value <= 0:
            raise HTTPException(status_code=400, detail=f"broker {field_name} must be greater than 0")
        if not must_be_positive and value < 0:
            raise HTTPException(status_code=400, detail=f"broker {field_name} cannot be negative")
        parsed_numeric[field_name] = value

    if parsed_numeric["earnest_money_amount"] > parsed_numeric["total_consideration"]:
        raise HTTPException(status_code=400, detail="broker earnest_money_amount cannot exceed total_consideration")

    balance_raw = broker.get("balance_amount")
    if balance_raw is not None and str(balance_raw).strip() != "":
        try:
            balance_amount = float(balance_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="broker contracts require numeric balance_amount")
        if balance_amount < 0:
            raise HTTPException(status_code=400, detail="broker balance_amount cannot be negative")

        expected_balance = parsed_numeric["total_consideration"] - parsed_numeric["earnest_money_amount"]
        if abs(balance_amount - expected_balance) > 2.0:
            raise HTTPException(
                status_code=400,
                detail="broker balance_amount must be close to total_consideration minus earnest_money_amount",
            )

    commission_amount_raw = broker.get("commission_amount")
    if commission_amount_raw is not None and str(commission_amount_raw).strip() != "":
        try:
            commission_amount = float(commission_amount_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="broker contracts require numeric commission_amount")
        if commission_amount < 0:
            raise HTTPException(status_code=400, detail="broker commission_amount cannot be negative")

        expected_commission = parsed_numeric["total_consideration"] * (parsed_numeric["commission_rate"] / 100)
        if abs(commission_amount - expected_commission) > 2.0:
            raise HTTPException(
                status_code=400,
                detail="broker commission_amount must be close to total_consideration * commission_rate / 100",
            )

    return payload.amount


def _validate_nda_data(payload: ContractCreate, template_data: dict) -> float:
    if (payload.type or "").strip().lower() != NDA_TYPE:
        return payload.amount

    nda = template_data.get("nda") if isinstance(template_data, dict) else None
    if not isinstance(nda, dict):
        raise HTTPException(status_code=400, detail="templateData.nda is required for nda contracts")

    required_text_fields = {
        "disclosingParty": "nda contracts require disclosingParty",
        "receivingParty": "nda contracts require receivingParty",
        "purpose": "nda contracts require purpose",
        "confidentialInfo": "nda contracts require confidentialInfo",
        "duration": "nda contracts require duration",
        "effectiveDate": "nda contracts require effectiveDate",
    }

    for field_name, message in required_text_fields.items():
        value = str(nda.get(field_name) or "").strip()
        if not value:
            raise HTTPException(status_code=400, detail=message)

    return payload.amount


def _validate_employment_data(payload: ContractCreate, template_data: dict) -> float:
    if (payload.type or "").strip().lower() != EMPLOYMENT_TYPE:
        return payload.amount

    employment = template_data.get("employment") if isinstance(template_data, dict) else None
    if not isinstance(employment, dict):
        raise HTTPException(status_code=400, detail="templateData.employment is required for employment contracts")

    required_text_fields = {
        "employerName": "employment contracts require employerName",
        "employeeName": "employment contracts require employeeName",
        "jobTitle": "employment contracts require jobTitle",
        "jobDescription": "employment contracts require jobDescription",
        "workHours": "employment contracts require workHours",
        "startDate": "employment contracts require startDate",
    }

    for field_name, message in required_text_fields.items():
        value = str(employment.get(field_name) or "").strip()
        if not value:
            raise HTTPException(status_code=400, detail=message)

    salary_raw = employment.get("salary")
    try:
        salary = float(salary_raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="employment contracts require numeric salary")

    if salary <= 0:
        raise HTTPException(status_code=400, detail="employment salary must be greater than 0")

    return salary


async def _attach_sender_fields(doc: dict) -> dict:
    if (not doc.get("userName") or not doc.get("userEmail")) and doc.get("userId"):
        sender = await users_collection.find_one({"_id": doc["userId"]}, {"name": 1, "email": 1})
        if sender:
            doc["userName"] = sender.get("name", "")
            doc["userEmail"] = sender.get("email", "")
    return doc


async def _generate_legacy_pdf_path(contract_id: str, doc: dict) -> str:
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
    except ValueError as error:
        logger.warning("Legacy PDF validation failed for contract %s: %s", contract_id, error)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # pragma: no cover - unexpected PDF failures
        logger.exception("Legacy PDF generation failed for contract %s", contract_id)
        raise HTTPException(status_code=500, detail="Failed to generate signed contract PDF.") from error

    await contracts_collection.update_one({"_id": doc["_id"]}, {"$set": {"pdf_path": pdf_path}})
    return pdf_path


async def create_contract(payload: ContractCreate, actor: dict) -> dict:
    logger.info("Creating contract for actor %s", actor.get("sub"))

    if str(payload.userId) != str(actor.get("sub")):
        raise HTTPException(status_code=403, detail="Cannot create contracts for another user")

    if payload.type not in SUPPORTED_CONTRACT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported contract type")

    user_oid = _validate_object_id(payload.userId, "user")
    user = await users_collection.find_one({"_id": user_oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    client_oid = _validate_object_id(payload.clientId, "client")
    client = await clients_collection.find_one({"_id": client_oid})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    template_data = _normalize_template_data(payload)
    normalized_amount = payload.amount
    contract_type = (payload.type or "").strip().lower()
    if contract_type == HOUSE_SALE_TYPE:
        normalized_amount = _validate_house_sale_data(payload, template_data)
    elif contract_type == WEBSITE_DEVELOPMENT_TYPE:
        normalized_amount = _validate_website_development_data(payload, template_data)
    elif contract_type == BROKER_TYPE:
        normalized_amount = _validate_broker_data(payload, template_data)
    elif contract_type == NDA_TYPE:
        normalized_amount = _validate_nda_data(payload, template_data)
    elif contract_type == EMPLOYMENT_TYPE:
        normalized_amount = _validate_employment_data(payload, template_data)
    elif contract_type == NDA_TYPE:
        normalized_amount = _validate_nda_data(payload, template_data)
    elif contract_type == EMPLOYMENT_TYPE:
        normalized_amount = _validate_employment_data(payload, template_data)

    doc = {
        "title": payload.title,
        "type": payload.type,
        "description": payload.description,
        "amount": normalized_amount,
        "currency": payload.currency,
        "dueDate": payload.dueDate,
        "clauses": payload.clauses.model_dump(),
        "templateData": template_data,
        "signatures": {"creator": payload.creator_signature, "client": None},
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
    doc["userId"] = str(doc["userId"])
    doc["clientId"] = str(doc["clientId"])
    return doc


async def get_contracts_by_user(user_id: str, actor: dict) -> list[dict]:
    if str(user_id) != str(actor.get("sub")):
        raise HTTPException(status_code=403, detail="You can only access your own contracts")

    user_oid = _validate_object_id(user_id, "user")
    cursor = contracts_collection.find({"userId": user_oid}).sort("createdAt", -1)
    results = []
    async for doc in cursor:
        doc = await _attach_sender_fields(doc)
        results.append(_serialize(doc))
    return results


async def get_contracts_by_client(client_id: str, actor: dict) -> list[dict]:
    if str(client_id) != str(actor.get("sub")):
        raise HTTPException(status_code=403, detail="You can only access your own contracts")

    client_oid = _validate_object_id(client_id, "client")
    cursor = contracts_collection.find({"clientId": client_oid}).sort("createdAt", -1)
    results = []
    async for doc in cursor:
        doc = await _attach_sender_fields(doc)
        results.append(_serialize(doc))
    return results


async def get_contract(contract_id: str, actor: dict) -> dict:
    oid = _validate_object_id(contract_id, "contract")
    doc = await contracts_collection.find_one({"_id": oid})

    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    requester_id = str(actor.get("sub") or "")
    requester_oid = _validate_object_id(requester_id, "authenticated user")
    if not _is_contract_owner(doc, requester_oid, requester_id):
        raise HTTPException(status_code=403, detail="You do not have access to this contract")

    doc = await _attach_sender_fields(doc)
    return _serialize(doc)


async def download_contract_pdf(contract_id: str, actor: dict) -> FileResponse:
    contract_oid = _validate_object_id(contract_id, "contract")
    requester_id = str(actor.get("sub") or "")
    requester_oid = _validate_object_id(requester_id, "authenticated user")

    doc = await contracts_collection.find_one({"_id": contract_oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    if not _is_contract_owner(doc, requester_oid, requester_id):
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
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Stored PDF path is invalid") from exc

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Signed PDF file is missing")

    return FileResponse(str(pdf_path), media_type="application/pdf", filename=f"contract_{contract_id}.pdf")


async def update_contract(contract_id: str, payload: ContractCreate, actor: dict) -> dict:
    oid = _validate_object_id(contract_id, "contract")

    existing = await contracts_collection.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Contract not found")

    requester_id = str(actor.get("sub") or "")
    requester_oid = _validate_object_id(requester_id, "authenticated user")
    if not _is_contract_owner(existing, requester_oid, requester_id):
        raise HTTPException(status_code=403, detail="You do not have access to this contract")

    if str(existing.get("userId") or "") != requester_id:
        raise HTTPException(status_code=403, detail="Only contract creator can edit this contract")

    if existing.get("status") != ContractStatus.draft.value:
        raise HTTPException(status_code=400, detail="Only draft contracts can be edited")

    if payload.type not in SUPPORTED_CONTRACT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported contract type")

    if str(payload.userId) != requester_id:
        raise HTTPException(status_code=403, detail="Cannot update contract owner")

    user_oid = _validate_object_id(payload.userId, "user")
    user = await users_collection.find_one({"_id": user_oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    client_oid = _validate_object_id(payload.clientId, "client")
    client = await clients_collection.find_one({"_id": client_oid})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    template_data = _normalize_template_data(payload)
    normalized_amount = payload.amount
    contract_type = (payload.type or "").strip().lower()
    if contract_type == HOUSE_SALE_TYPE:
        normalized_amount = _validate_house_sale_data(payload, template_data)
    elif contract_type == WEBSITE_DEVELOPMENT_TYPE:
        normalized_amount = _validate_website_development_data(payload, template_data)
    elif contract_type == BROKER_TYPE:
        normalized_amount = _validate_broker_data(payload, template_data)

    update_fields = {
        "title": payload.title,
        "type": payload.type,
        "description": payload.description,
        "amount": normalized_amount,
        "currency": payload.currency,
        "dueDate": payload.dueDate,
        "clauses": payload.clauses.model_dump(),
        "templateData": template_data,
        "signatures.creator": payload.creator_signature,
        "userId": user_oid,
        "userName": user.get("name", ""),
        "userEmail": user.get("email", ""),
        "clientId": client_oid,
        "clientName": client.get("name", ""),
        "clientEmail": client.get("email", ""),
    }

    result = await contracts_collection.find_one_and_update(
        {"_id": oid, "status": ContractStatus.draft.value},
        {"$set": update_fields},
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        raise HTTPException(status_code=400, detail="Only draft contracts can be edited")

    return _serialize(result)


async def update_contract_status(contract_id: str, payload, actor: dict) -> dict:
    oid = _validate_object_id(contract_id, "contract")

    allowed_transitions = {
        "draft": {"sent", "pending"},
        "sent": {"declined", "signed"},
        "pending": {"declined", "signed"},
    }

    existing = await contracts_collection.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Contract not found")

    requester_id = str(actor.get("sub") or "")
    requester_oid = _validate_object_id(requester_id, "authenticated user")
    if not _is_contract_owner(existing, requester_oid, requester_id):
        raise HTTPException(status_code=403, detail="You do not have access to this contract")

    current = existing["status"]
    target = payload.status.value
    allowed = allowed_transitions.get(current, set())
    if target not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot transition from '{current}' to '{target}'")

    update_fields: dict = {"status": target}
    if target == "signed":
        update_fields["signedAt"] = datetime.now(timezone.utc)

    result = await contracts_collection.find_one_and_update(
        {"_id": oid},
        {"$set": update_fields},
        return_document=ReturnDocument.AFTER,
    )
    return _serialize(result)


async def send_contract(contract_id: str, actor: dict) -> dict:
    oid = _validate_object_id(contract_id, "contract")
    requester_oid = _validate_object_id(str(actor.get("sub") or ""), "authenticated user")
    creator_signature_filter = {"$exists": True, "$nin": [None, ""]}

    result = await contracts_collection.find_one_and_update(
        {
            "_id": oid,
            "userId": requester_oid,
            "status": ContractStatus.draft.value,
            "signatures.creator": creator_signature_filter,
        },
        {"$set": {"status": ContractStatus.sent.value}},
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        existing = await contracts_collection.find_one({"_id": oid})
        if not existing:
            raise HTTPException(status_code=404, detail="Contract not found")
        if str(existing.get("userId") or "") != str(actor.get("sub") or ""):
            raise HTTPException(status_code=403, detail="You do not have access to this contract")
        existing_signatures = existing.get("signatures") or {}
        if not str(existing_signatures.get("creator") or "").strip():
            raise HTTPException(status_code=400, detail="Please sign the contract before sending.")
        raise HTTPException(status_code=400, detail=f"Cannot send — contract status is '{existing['status']}' (must be 'draft')")

    return _serialize(result)
