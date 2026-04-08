"""
Pydantic models for the **contracts** collection.

MongoDB document example
────────────────────────
{
  "_id":         ObjectId("..."),
    "title":       "Website Development Agreement",
    "type":        "website_development",
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


class WebsiteDevelopmentTemplateData(BaseModel):
    agreement_place: Optional[str] = None
    company_name: Optional[str] = None
    developer_name: Optional[str] = None
    company_address: Optional[str] = None
    developer_address: Optional[str] = None
    project_purpose: Optional[str] = None
    consultation_hours: Optional[float] = Field(default=None, ge=0)
    page_count: Optional[int] = Field(default=None, ge=0)
    web_page_word_count: Optional[int] = Field(default=None, ge=0)
    external_links_per_page: Optional[float] = Field(default=None, ge=0)
    masthead_graphic: Optional[str] = None
    photo_graphics_average: Optional[float] = Field(default=None, ge=0)
    update_period_months: Optional[int] = Field(default=None, ge=0)
    search_engine_publicity: Optional[bool] = None
    email_response_enabled: Optional[bool] = None
    image_map_enabled: Optional[bool] = None
    fee_total: Optional[float] = Field(default=None, ge=0)
    initial_payment_amount: Optional[float] = Field(default=None, ge=0)
    mid_payment_amount: Optional[float] = Field(default=None, ge=0)
    completion_payment_amount: Optional[float] = Field(default=None, ge=0)
    content_due_days: Optional[int] = Field(default=None, ge=0)
    completion_months: Optional[int] = Field(default=None, ge=0)
    maintenance_months: Optional[int] = Field(default=None, ge=0)
    additional_graphics_fee: Optional[float] = Field(default=None, ge=0)
    transparency_fee: Optional[float] = Field(default=None, ge=0)
    hourly_rate: Optional[float] = Field(default=None, ge=0)
    continuation_fee_percent: Optional[float] = Field(default=None, ge=0)


class BrokerAgreementTemplateData(BaseModel):
    agreement_place: Optional[str] = None
    owner_name: Optional[str] = None
    owner_residence: Optional[str] = None
    broker_name: Optional[str] = None
    broker_residence: Optional[str] = None
    property_details: Optional[str] = None
    total_consideration: Optional[float] = Field(default=None, ge=0)
    earnest_money_amount: Optional[float] = Field(default=None, ge=0)
    balance_amount: Optional[float] = Field(default=None, ge=0)
    completion_period_months: Optional[int] = Field(default=None, ge=0)
    broker_sale_period_months: Optional[int] = Field(default=None, ge=0)
    commission_rate: Optional[float] = Field(default=None, ge=0)
    commission_amount: Optional[float] = Field(default=None, ge=0)
    witness_1_name: Optional[str] = None
    witness_2_name: Optional[str] = None


class NDATemplateData(BaseModel):
    disclosingParty: Optional[str] = None
    receivingParty: Optional[str] = None
    purpose: Optional[str] = None
    confidentialInfo: Optional[str] = None
    duration: Optional[str] = None
    effectiveDate: Optional[str] = None


class EmploymentTemplateData(BaseModel):
    employerName: Optional[str] = None
    employeeName: Optional[str] = None
    jobTitle: Optional[str] = None
    jobDescription: Optional[str] = None
    salary: Optional[float] = Field(default=None, ge=0)
    paymentFrequency: Optional[str] = None
    workHours: Optional[str] = None
    terminationClause: Optional[str] = None
    startDate: Optional[str] = None


class TemplateData(BaseModel):
    houseSale: Optional[HouseSaleTemplateData] = None
    websiteDevelopment: Optional[WebsiteDevelopmentTemplateData] = None
    brokerAgreement: Optional[BrokerAgreementTemplateData] = None
    nda: Optional[NDATemplateData] = None
    employment: Optional[EmploymentTemplateData] = None


# ── Request body for creating a contract ──────────────────────
class ContractCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, examples=["Website Development Agreement"])
    type: Literal["house_sale", "website_development", "broker", "nda", "employment"] = Field(
        ...,
        examples=["website_development"],
    )
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
    type: Literal["house_sale", "website_development", "broker", "nda", "employment"]
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
