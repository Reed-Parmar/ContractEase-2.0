"""Reusable utility helpers for contract PDF generation.

This module keeps template rendering and file-path logic separate from the
service layer so it can be reused by route handlers or background jobs later.
"""

from __future__ import annotations

from datetime import date, datetime
from hashlib import sha256
from pathlib import Path
import re
from typing import Any, Mapping
from urllib.parse import urlparse
from uuid import uuid4

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..config import PDF_FILE_PREFIX, PDF_STORAGE_PATH, PDF_TEMPLATE_PATH

SUPPORTED_CURRENCIES = {"₹", "$", "€"}
DEFAULT_CURRENCY = "₹"
HOUSE_SALE_TYPE = "house_sale"


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

    return f"{currency}{numeric_amount:,.2f}"


def _to_display_date(value: Any) -> str:
    """Convert common date inputs into a printable contract date string."""
    def render_long_date(dt: datetime | date) -> str:
        month_name = dt.strftime("%B")
        return f"{dt.day} {month_name} {dt.year}"

    if value is None:
        return render_long_date(datetime.utcnow())

    if isinstance(value, datetime):
        return render_long_date(value)

    if isinstance(value, date):
        return render_long_date(value)

    value_text = str(value).strip()
    if not value_text:
        return render_long_date(datetime.utcnow())

    try:
        parsed = datetime.fromisoformat(value_text.replace("Z", "+00:00"))
        return render_long_date(parsed)
    except ValueError:
        return value_text


def validate_signature_src(signature_value: Any) -> str:
    """Validate and normalize signature source values for HTML img tags.

    Allowed values:
    - data:image/*;base64,...
    - http(s) image URLs
    - raw base64 image payloads (auto-prefixed as PNG)

    Any other scheme/value is rejected and returns an empty string.
    """
    if signature_value is None:
        return ""

    value_text = str(signature_value).strip()
    if not value_text:
        return ""

    lower_text = value_text.lower()
    if lower_text.startswith(("javascript:", "vbscript:", "data:text/html")):
        return ""

    if lower_text.startswith("data:image/"):
        if ";base64," not in lower_text:
            return ""
        return value_text

    parsed = urlparse(value_text)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return value_text

    # Reject all other explicit URI schemes.
    if parsed.scheme:
        return ""

    compact_value = re.sub(r"\s+", "", value_text)
    if re.fullmatch(r"[A-Za-z0-9+/=]+", compact_value or ""):
        return f"data:image/png;base64,{compact_value}"

    return ""


def normalize_signature_data(signature_value: Any) -> str:
    """Backwards-compatible wrapper around signature src validation."""
    return validate_signature_src(signature_value)


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
    contract_type = str(contract_data.get("type") or "").strip().lower()
    if contract_type == HOUSE_SALE_TYPE:
        return build_house_sale_template_context(contract_data)

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


def build_house_sale_template_context(contract_data: Mapping[str, Any]) -> dict[str, Any]:
    """Build house-sale template context.

    Raises:
        ValueError: When required house-sale monetary/timeline fields are missing.
    """
    template_data = contract_data.get("templateData") or {}
    house_sale = template_data.get("houseSale") if isinstance(template_data, Mapping) else {}
    if not isinstance(house_sale, Mapping):
        house_sale = {}

    def text_value(key: str, fallback: str = "") -> str:
        value = house_sale.get(key)
        if value is None:
            return fallback
        return str(value).strip() or fallback

    currency = _normalize_currency_symbol(contract_data.get("currency"), DEFAULT_CURRENCY)
    sale_price_raw = house_sale.get("sale_price")
    if sale_price_raw is None or str(sale_price_raw).strip() == "":
        sale_price_raw = contract_data.get("amount")
    sale_price = _format_currency_amount(sale_price_raw, currency)
    if sale_price is None:
        raise ValueError("Missing required field(s) for house-sale PDF rendering: sale_price")

    earnest_money_raw = house_sale.get("earnest_money_amount")
    earnest_money_amount = _format_currency_amount(earnest_money_raw, currency)
    if earnest_money_amount is None:
        raise ValueError("Missing required field(s) for house-sale PDF rendering: earnest_money_amount")

    completion_period_raw = house_sale.get("completion_period_months")
    if completion_period_raw is None or str(completion_period_raw).strip() == "":
        raise ValueError("Missing required field(s) for house-sale PDF rendering: completion_period_months")

    try:
        completion_period_months = int(float(str(completion_period_raw).strip()))
    except (TypeError, ValueError):
        raise ValueError("Invalid required field for house-sale PDF rendering: completion_period_months")

    if completion_period_months <= 0:
        raise ValueError("Invalid required field for house-sale PDF rendering: completion_period_months must be greater than 0")

    agreement_date = _to_display_date(
        house_sale.get("agreement_date")
        or contract_data.get("signed_date")
        or contract_data.get("due_date")
    )

    vendor_name = text_value("vendor_name", contract_data.get("creator_name") or "Vendor")
    purchaser_name = text_value("purchaser_name", contract_data.get("client_name") or "Purchaser")
    witness_1_name = text_value("witness_1_name")
    witness_2_name = text_value("witness_2_name")
    has_witnesses = bool(witness_1_name or witness_2_name)
    creator_signature = normalize_signature_data(contract_data.get("signature_creator"))
    client_signature = normalize_signature_data(contract_data.get("signature_client"))

    return {
        "contract_title": contract_data.get("title") or "Agreement for Sale of a House",
        "agreement_place": text_value("agreement_place", "____________"),
        "agreement_date": agreement_date,
        "vendor_name": vendor_name,
        "vendor_residence": text_value("vendor_residence", "____________"),
        "purchaser_name": purchaser_name,
        "purchaser_residence": text_value("purchaser_residence", "____________"),
        "property_details": text_value("property_details", "Property details to be confirmed."),
        "sale_price": sale_price,
        "earnest_money_amount": earnest_money_amount,
        "completion_period_months": str(completion_period_months),
        "witness_1_name": witness_1_name,
        "witness_2_name": witness_2_name,
        "has_witnesses": has_witnesses,
        "signature_creator": creator_signature,
        "signature_client": client_signature,
        "creator_signature": creator_signature,
        "client_signature": client_signature,
        "creator_name": contract_data.get("creator_name") or vendor_name,
        "client_name": contract_data.get("client_name") or purchaser_name,
        "formatted_date": _to_display_date(contract_data.get("signed_date") or contract_data.get("due_date")),
    }


def render_contract_template(
    context: Mapping[str, Any],
    template_path: Path = PDF_TEMPLATE_PATH,
    template_name: str | None = None,
) -> str:
    """Render the Jinja2 contract template with a provided context map."""
    env = Environment(
        loader=FileSystemLoader(str(template_path.parent)),
        autoescape=select_autoescape(enabled_extensions=("html", "xml")),
    )
    selected_template = template_name or template_path.name
    template = env.get_template(selected_template)
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
