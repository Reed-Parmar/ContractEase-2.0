"""Routes for the **signatures** collection.
Handles contract signing.
"""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_actor, require_role
from app.models.signature import SignatureCreate, SignatureOut
from app.services.signature_service import (
    ensure_signature_indexes as ensure_signature_indexes_service,
    get_contract_signature as get_contract_signature_service,
    sign_contract as sign_contract_service,
)

router = APIRouter(prefix="/contracts", tags=["Signatures"])


@router.on_event("startup")
async def _ensure_signatures_collection() -> None:
    await ensure_signature_indexes_service()


# ── POST /contracts/{id}/sign  ────────────────────────────────
@router.post("/{contract_id}/sign", response_model=SignatureOut, status_code=201)
async def sign_contract(
    contract_id: str,
    payload: SignatureCreate,
    actor: dict = Depends(require_role("client")),
):
    return await sign_contract_service(contract_id, payload, actor)


# ── GET /contracts/{id}/signature  ───────────────────────────
@router.get("/{contract_id}/signature")
async def get_contract_signature(
    contract_id: str,
    actor: dict = Depends(get_current_actor),
):
    return await get_contract_signature_service(contract_id, actor)
