"""
Pydantic models for the **signatures** collection.

MongoDB document example
────────────────────────
{
  "_id":             ObjectId("..."),
  "contractId":      "665c...",
  "signerName":      "Jane Smith",
  "signerEmail":     "jane@acme.com",
  "signatureImage":  "data:image/png;base64,iVBOR...",
  "signedAt":        "2026-02-18T14:00:00Z"
}
"""

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


# ── Request body for signing a contract ───────────────────────
class SignatureCreate(BaseModel):
    signerName: str = Field(..., min_length=1, max_length=100, examples=["Jane Smith"])
    signerEmail: EmailStr = Field(..., examples=["jane@acme.com"])
    signatureImage: str = Field(
        ...,
        min_length=1,
        description="Base64-encoded signature image",
        examples=["data:image/png;base64,iVBOR..."],
    )


# ── Full signature document returned by the API ──────────────
class SignatureOut(BaseModel):
    id: str = Field(..., alias="_id")
    contractId: str
    signerName: str
    signerEmail: EmailStr
    signatureImage: str
    signedAt: datetime

    model_config = {"populate_by_name": True}
