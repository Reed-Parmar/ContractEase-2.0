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
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ── Allowed contract statuses ─────────────────────────────────
class ContractStatus(str, Enum):
    draft = "draft"
    sent = "sent"
    signed = "signed"
    declined = "declined"
    pending = "pending"


# ── Clause toggles (mirrors the frontend toggle switches) ─────
class Clauses(BaseModel):
    payment: bool = True
    liability: bool = False
    confidentiality: bool = True
    termination: bool = False


class ContractSignatures(BaseModel):
    creator: Optional[str] = None
    client: Optional[str] = None


class HouseSaleTemplateData(BaseModel):
    agreement_place: Optional[str] = None
    agreement_date: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_residence: Optional[str] = None
    purchaser_name: Optional[str] = None
    purchaser_residence: Optional[str] = None
    property_details: Optional[str] = None
    sale_price: Optional[float] = Field(default=None, ge=0)
    earnest_money_amount: Optional[float] = Field(default=None, ge=0)
    completion_period_months: Optional[int] = Field(default=None, ge=0)
    witness_1_name: Optional[str] = None
    witness_2_name: Optional[str] = None

    @field_validator("agreement_date")
    @classmethod
    def validate_agreement_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value

        text = str(value).strip()
        if not text:
            return None

        if len(text) != 10 or text[4] != "-" or text[7] != "-":
            raise ValueError("agreement_date must be ISO format YYYY-MM-DD")

        year = int(text[:4])
        month = int(text[5:7])
        day = int(text[8:10])

        if year < 1900 or year > 2100:
            raise ValueError("agreement_date year must be between 1900 and 2100")

        # Validate actual calendar date.
        datetime(year=year, month=month, day=day)
        return f"{year:04d}-{month:02d}-{day:02d}"


class TemplateData(BaseModel):
    houseSale: Optional[HouseSaleTemplateData] = None


# ── Request body for creating a contract ──────────────────────
class ContractCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, examples=["Web Development Services"])
    type: str = Field(..., min_length=1, examples=["service"])
    description: Optional[str] = Field(None, examples=["Full-stack web development project"])
    amount: float = Field(..., ge=0, examples=[5000.00])
    currency: Literal["₹", "$", "€"] = Field(default="₹", examples=["₹"])
    dueDate: datetime = Field(..., examples=["2026-03-15T00:00:00Z"])
    clauses: Clauses = Field(default_factory=Clauses)
    userId: str = Field(..., description="Reference to users collection")
    clientId: str = Field(..., description="Reference to clients collection")
    creator_signature: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=700_000,
        description="Base64-encoded creator signature image",
        examples=["data:image/png;base64,iVBOR..."],
    )
    templateData: Optional[TemplateData] = None


# ── Full contract document returned by the API ────────────────
class ContractOut(BaseModel):
    id: str = Field(..., alias="_id")
    title: str
    type: str
    description: Optional[str] = None
    amount: float
    currency: Literal["₹", "$", "€"] = "₹"
    dueDate: datetime
    clauses: Clauses
    signatures: ContractSignatures = Field(default_factory=ContractSignatures)
    templateData: Optional[TemplateData] = None
    status: ContractStatus
    userId: str
    userName: Optional[str] = None
    userEmail: Optional[str] = None
    clientId: str
    clientName: Optional[str] = None
    clientEmail: Optional[str] = None
    createdAt: datetime
    signedAt: Optional[datetime] = None

    model_config = {"populate_by_name": True}
