"""
Pydantic models for the **users** collection.

MongoDB document example
────────────────────────
{
  "_id":        ObjectId("..."),
  "name":       "John Doe",
  "email":      "john@example.com",
  "password":   "secret123",
  "createdAt":  "2026-02-18T10:30:00Z"
}
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ── Request body for creating a user ──────────────────────────
class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["John Doe"])
    email: EmailStr = Field(..., examples=["john@example.com"])
    password: str = Field(..., min_length=1, examples=["secret123"])


# ── Full user document returned by the API ────────────────────
class UserOut(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    email: EmailStr
    createdAt: datetime

    model_config = {"populate_by_name": True}
