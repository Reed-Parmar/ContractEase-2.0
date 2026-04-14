"""Routes for the **contracts** collection.
Handles creation, retrieval, and status updates.
"""

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import get_current_actor, require_role
from app.models.contract import ContractCreate, ContractOut, ContractStatus
from app.services.contract_service import (
    create_contract as create_contract_service,
    download_contract_pdf as download_contract_pdf_service,
    get_contract as get_contract_service,
    get_contracts_by_client as get_contracts_by_client_service,
    get_contracts_by_user as get_contracts_by_user_service,
    send_contract as send_contract_service,
    update_contract as update_contract_service,
    update_contract_status as update_contract_status_service,
)

router = APIRouter(prefix="/contracts", tags=["Contracts"])


class StatusUpdate(BaseModel):
    status: ContractStatus


@router.post("/", response_model=ContractOut, status_code=201)
async def create_contract(payload: ContractCreate, actor: dict = Depends(require_role("user"))):
    return await create_contract_service(payload, actor)


@router.get("/user/{user_id}", response_model=List[ContractOut])
async def get_contracts_by_user(user_id: str, actor: dict = Depends(require_role("user"))):
    return await get_contracts_by_user_service(user_id, actor)


@router.get("/client/{client_id}", response_model=List[ContractOut])
async def get_contracts_by_client(client_id: str, actor: dict = Depends(require_role("client"))):
    return await get_contracts_by_client_service(client_id, actor)


@router.get("/{contract_id}", response_model=ContractOut)
async def get_contract(contract_id: str, actor: dict = Depends(get_current_actor)):
    return await get_contract_service(contract_id, actor)


@router.get("/{contract_id}/download")
async def download_contract_pdf(contract_id: str, actor: dict = Depends(get_current_actor)):
    return await download_contract_pdf_service(contract_id, actor)


@router.patch("/{contract_id}", response_model=ContractOut)
async def update_contract(contract_id: str, payload: ContractCreate, actor: dict = Depends(require_role("user"))):
    return await update_contract_service(contract_id, payload, actor)


@router.patch("/{contract_id}/status", response_model=ContractOut)
async def update_contract_status(contract_id: str, payload: StatusUpdate, actor: dict = Depends(get_current_actor)):
    return await update_contract_status_service(contract_id, payload, actor)


@router.put("/{contract_id}/send", response_model=ContractOut)
async def send_contract(contract_id: str, actor: dict = Depends(require_role("user"))):
    return await send_contract_service(contract_id, actor)
