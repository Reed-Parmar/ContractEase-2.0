"""
Pydantic models for the **clients** collection.

MongoDB document example
────────────────────────
{
  "_id":        ObjectId("..."),
  "name":       "Acme Corporation",
  "email":      "contact@acme.com",
  "createdAt":  "2026-02-18T10:30:00Z"
}
"""

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


# ── Request body for creating a client ────────────────────────
class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Acme Corporation"])
    email: EmailStr = Field(..., examples=["contact@acme.com"])


# ── Full client document returned by the API ──────────────────
class ClientOut(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    email: EmailStr
    createdAt: datetime

    model_config = {"populate_by_name": True}
