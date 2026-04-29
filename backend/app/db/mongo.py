"""
MongoDB connection manager using Motor (async driver).
Provides a single shared client and convenience accessors for each collection.
"""

import logging

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import (
    MONGO_URI,
    DATABASE_NAME,
    MONGO_SERVER_SELECTION_TIMEOUT_MS,
    MONGO_CONNECT_TIMEOUT_MS,
    MONGO_SOCKET_TIMEOUT_MS,
    MONGO_MAX_POOL_SIZE,
    MONGO_MIN_POOL_SIZE,
    MONGO_MAX_IDLE_TIME_MS,
)


logger = logging.getLogger(__name__)


# Shared Motor client — created once, reused across the app
client = AsyncIOMotorClient(
    MONGO_URI,
    serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS=MONGO_CONNECT_TIMEOUT_MS,
    socketTimeoutMS=MONGO_SOCKET_TIMEOUT_MS,
    maxPoolSize=MONGO_MAX_POOL_SIZE,
    minPoolSize=MONGO_MIN_POOL_SIZE,
    maxIdleTimeMS=MONGO_MAX_IDLE_TIME_MS,
)

# Database handle
db = client[DATABASE_NAME]


async def close_mongo_connection() -> None:
    """Gracefully close the Motor client (call on app shutdown)."""
    client.close()


async def ensure_mongo_ready() -> None:
    """Ping MongoDB during startup to fail fast with actionable logs."""
    try:
        await client.admin.command("ping")
    except Exception:
        logger.exception("MongoDB ping failed during startup")
        raise

# ── Collection handles ────────────────────────────────────────
users_collection = db["users"]
clients_collection = db["clients"]
contracts_collection = db["contracts"]
signatures_collection = db["signatures"]
