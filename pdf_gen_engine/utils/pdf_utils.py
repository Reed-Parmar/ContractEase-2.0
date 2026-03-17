"""Reusable utility helpers for contract PDF generation.

This module keeps template rendering and file-path logic separate from the
service layer so it can be reused by route handlers or background jobs later.
"""

from __future__ import annotations

from datetime import date, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..config import PDF_FILE_PREFIX, PDF_STORAGE_PATH, PDF_TEMPLATE_PATH

SUPPORTED_CURRENCIES = {"₹", "$", "€"}
DEFAULT_CURRENCY = "₹"


def _normalize_currency_symbol(value: Any, fallback: str = DEFAULT_CURRENCY) -> str:
    currency = str(value or "").strip()
    return currency if currency in SUPPORTED_CURRENCIES else fallback


def _format_currency_amount(amount: Any, currency: str) -> str | None:
    if amount is None:
        return None

    if isinstance(amount, str) and not amount.strip():
        return None

    try:
        numeric_amount = float(amount)
    except (TypeError, ValueError):
        return f"{currency}{str(amount).strip()}"

    return f"{currency}{numeric_amount:.2f}"


def _to_display_date(value: Any) -> str:
    """Convert common date inputs into a printable contract date string."""
    if value is None:
        return datetime.utcnow().strftime("%d/%m/%Y")

    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")

    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")

    value_text = str(value).strip()
    if not value_text:
        return datetime.utcnow().strftime("%d/%m/%Y")

    try:
        parsed = datetime.fromisoformat(value_text.replace("Z", "+00:00"))
        return parsed.strftime("%d/%m/%Y")
    except ValueError:
        return value_text


def normalize_signature_data(signature_value: Any) -> str:
    """Normalize signatures to an embeddable data URL string for HTML img tags."""
    if signature_value is None:
        return ""

    value_text = str(signature_value).strip()
    if not value_text:
        return ""

    if value_text.startswith("data:image"):
        return value_text

    return f"data:image/png;base64,{value_text}"


def normalize_contract_terms(terms: Any) -> list[str]:
    """Normalize contract terms into a list of printable items."""
    if terms is None:
        return []

    if isinstance(terms, str):
        return [line.strip() for line in terms.splitlines() if line.strip()]

    if isinstance(terms, (list, tuple, set)):
        normalized_terms: list[str] = []
        for item in terms:
            item_text = str(item).strip()
            if item_text:
                normalized_terms.append(item_text)
        return normalized_terms

    value_text = str(terms).strip()
    return [value_text] if value_text else []


def _resolve_clause_flag(
    contract_data: Mapping[str, Any],
    clauses: Mapping[str, Any],
    key: str,
    default: bool = False,
) -> bool:
    """Resolve a clause flag from nested or flat contract payloads."""
    if key in clauses:
        return bool(clauses.get(key))
    return bool(contract_data.get(key, default)) if key in contract_data else default


def build_contract_template_context(contract_data: Mapping[str, Any]) -> dict[str, Any]:
    """Build a safe template context from incoming contract payload data."""
    terms_list = normalize_contract_terms(contract_data.get("contract_terms"))
    clauses = contract_data.get("clauses") or {}
    description_text = str(
        contract_data.get("contract_description")
        or contract_data.get("description")
        or ""
    ).strip()
    contract_title = contract_data.get("contract_title") or contract_data.get("title") or "Service Agreement"
    currency = _normalize_currency_symbol(contract_data.get("currency"), DEFAULT_CURRENCY)
    raw_contract_amount = contract_data.get("contract_amount")
    if raw_contract_amount is None:
        raw_contract_amount = contract_data.get("amount")
    contract_amount = _format_currency_amount(raw_contract_amount, currency)
    due_date = _to_display_date(contract_data.get("due_date"))

    payment_enabled = _resolve_clause_flag(contract_data, clauses, "payment", True)
    liability_enabled = _resolve_clause_flag(contract_data, clauses, "liability", False)
    confidentiality_enabled = _resolve_clause_flag(contract_data, clauses, "confidentiality", False)
    termination_enabled = _resolve_clause_flag(contract_data, clauses, "termination", False)

    services_scope_text = (
        description_text
        or "The provider will deliver the agreed services in a professional and timely manner."
    )
    deliverables_text = (
        f"The provider will deliver the agreed work product, revisions, and final materials required for {contract_title}."
        + (
            " All approved deliverables remain subject to the agreed limitation of liability."
            if liability_enabled
            else ""
        )
    )
    confidentiality_text = (
        "Both parties agree to maintain the confidentiality of proprietary information shared during the course of this engagement."
        if confidentiality_enabled
        else "No additional confidentiality clause was selected for this agreement."
    )
    termination_text = (
        "Either party may terminate this agreement with written notice. All outstanding obligations must be fulfilled prior to termination."
        if termination_enabled
        else "This agreement remains active until the contracted work is completed or the parties otherwise agree in writing."
    )
    if payment_enabled:
        if contract_amount is None:
            payment_text = (
                f"Payment terms will be confirmed separately. The active date for this agreement is {due_date}."
            )
        else:
            payment_text = (
                f"In consideration for the services provided, the Client agrees to pay the total amount of {contract_amount}. Payment shall be due no later than {due_date}."
            )
    else:
        if contract_amount is None:
            payment_text = (
                f"Commercial terms for this agreement will be confirmed separately, with the active date set for {due_date}."
            )
        else:
            payment_text = (
                f"Commercial terms for this agreement total {contract_amount}, with the active date set for {due_date}."
            )

    signed_date = _to_display_date(contract_data.get("signed_date"))

    return {
        "contract_title": contract_title,
        "client_name": contract_data.get("client_name")
        or contract_data.get("client")
        or "Client",
        "creator_name": contract_data.get("creator_name")
        or contract_data.get("creator")
        or "Creator",
        "contract_terms": "\n".join(terms_list)
        or str(contract_data.get("contract_terms", "")).strip()
        or "Terms will be provided by the contracting parties.",
        "contract_terms_list": terms_list,
        "contract_amount": contract_amount,
        "currency": currency,
        "due_date": due_date,
        "signed_date": signed_date,
        "formatted_date": signed_date,
        "formatted_due_date": due_date,
        "services_scope_text": services_scope_text,
        "payment_text": payment_text,
        "deliverables_text": deliverables_text,
        "confidentiality_text": confidentiality_text,
        "termination_text": termination_text,
        "signature_text": "By electronically signing below, the parties acknowledge that they have read, understood, and agreed to be bound by all terms and conditions set forth within this document.",
        "signature_creator": normalize_signature_data(
            contract_data.get("signature_creator")
        ),
        "signature_client": normalize_signature_data(
            contract_data.get("signature_client")
        ),
    }


def render_contract_template(
    context: Mapping[str, Any],
    template_path: Path = PDF_TEMPLATE_PATH,
) -> str:
    """Render the Jinja2 contract template with a provided context map."""
    env = Environment(
        loader=FileSystemLoader(str(template_path.parent)),
        autoescape=select_autoescape(enabled_extensions=("html", "xml")),
    )
    template = env.get_template(template_path.name)
    return template.render(**dict(context))


def ensure_pdf_storage_dir(storage_path: Path = PDF_STORAGE_PATH) -> Path:
    """Create the PDF output directory if it does not already exist."""
    storage_path.mkdir(parents=True, exist_ok=True)
    return storage_path


def build_pdf_output_path(
    contract_data: Mapping[str, Any],
    storage_path: Path = PDF_STORAGE_PATH,
) -> Path:
    """Generate a deterministic and collision-safe output path for a PDF file."""
    contract_id = str(contract_data.get("contract_id") or contract_data.get("id") or "").strip()
    suffix = contract_id if contract_id else uuid4().hex
    file_name = f"{PDF_FILE_PREFIX}_{suffix}.pdf"
    return storage_path / file_name


def compute_pdf_sha256(pdf_content: bytes) -> str:
    """Return a SHA256 digest for generated PDF bytes."""
    return sha256(pdf_content).hexdigest()
