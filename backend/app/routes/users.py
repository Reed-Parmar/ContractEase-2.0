"""Routes for the **users** collection."""

from fastapi import APIRouter

from app.models.user import UserCreate, UserOut
from app.services.account_service import create_user as create_user_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(payload: UserCreate):
    return await create_user_service(payload)
