"""
MongoDB connection manager using Motor (async driver).
Provides a single shared client and convenience accessors for each collection.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import MONGO_URI, DATABASE_NAME


# Shared Motor client — created once, reused across the app
client = AsyncIOMotorClient(MONGO_URI)

# Database handle
db = client[DATABASE_NAME]

# ── Collection handles ────────────────────────────────────────
users_collection = db["users"]
clients_collection = db["clients"]
contracts_collection = db["contracts"]
signatures_collection = db["signatures"]
