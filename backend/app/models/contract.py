"""
Pydantic models for the **contracts** collection.

MongoDB document example
────────────────────────
{
  "_id":         ObjectId("..."),
  "title":       "Web Development Services",
  "type":        "service",
  "description": "Full-stack web development project",
  "amount":      5000.00,
  "dueDate":     "2026-03-15T00:00:00Z",
  "clauses": {
    "payment":          true,
    "liability":        false,
    "confidentiality":  true,
    "termination":      false
  },
  "status":    "draft",
  "userId":    "665a...",
  "clientId":  "665b...",
  "createdAt": "2026-02-18T10:30:00Z"
}
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Allowed contract statuses ─────────────────────────────────
class ContractStatus(str, Enum):
    draft = "draft"
    sent = "sent"
    signed = "signed"
    declined = "declined"


# ── Clause toggles (mirrors the frontend toggle switches) ─────
class Clauses(BaseModel):
    payment: bool = True
    liability: bool = False
    confidentiality: bool = True
    termination: bool = False


# ── Request body for creating a contract ──────────────────────
class ContractCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, examples=["Web Development Services"])
    type: str = Field(..., min_length=1, examples=["service"])
    description: Optional[str] = Field(None, examples=["Full-stack web development project"])
    amount: float = Field(..., ge=0, examples=[5000.00])
    dueDate: datetime = Field(..., examples=["2026-03-15T00:00:00Z"])
    clauses: Clauses = Field(default_factory=Clauses)
    userId: str = Field(..., description="Reference to users collection")
    clientId: str = Field(..., description="Reference to clients collection")


# ── Full contract document returned by the API ────────────────
class ContractOut(BaseModel):
    id: str = Field(..., alias="_id")
    title: str
    type: str
    description: Optional[str] = None
    amount: float
    dueDate: datetime
    clauses: Clauses
    status: ContractStatus
    userId: str
    clientId: str
    createdAt: datetime

    model_config = {"populate_by_name": True}
