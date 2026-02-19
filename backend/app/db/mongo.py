"""
MongoDB connection manager using Motor (async driver).
Provides a single shared client and convenience accessors for each collection.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import (
    MONGO_URI,
    DATABASE_NAME,
    MONGO_SERVER_SELECTION_TIMEOUT_MS,
    MONGO_CONNECT_TIMEOUT_MS,
    MONGO_MAX_POOL_SIZE,
    MONGO_MIN_POOL_SIZE,
)


# Shared Motor client — created once, reused across the app
client = AsyncIOMotorClient(
    MONGO_URI,
    serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS=MONGO_CONNECT_TIMEOUT_MS,
    maxPoolSize=MONGO_MAX_POOL_SIZE,
    minPoolSize=MONGO_MIN_POOL_SIZE,
)

# Database handle
db = client[DATABASE_NAME]


async def close_mongo_connection() -> None:
    """Gracefully close the Motor client (call on app shutdown)."""
    client.close()

# ── Collection handles ────────────────────────────────────────
users_collection = db["users"]
clients_collection = db["clients"]
contracts_collection = db["contracts"]
signatures_collection = db["signatures"]
