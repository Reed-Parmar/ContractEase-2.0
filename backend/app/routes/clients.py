"""Routes for the **clients** collection."""

from fastapi import APIRouter

from app.models.client import ClientCreate, ClientOut
from app.services.account_service import create_client as create_client_service, ensure_client_indexes

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.on_event("startup")
async def _ensure_indexes():
    await ensure_client_indexes()


@router.post("/", response_model=ClientOut, status_code=201)
async def create_client(payload: ClientCreate):
    return await create_client_service(payload)
