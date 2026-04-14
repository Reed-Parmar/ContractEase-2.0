"""
Application configuration.
Reads settings from environment variables with sensible defaults.
"""

import os

from dotenv import load_dotenv


load_dotenv()


# MongoDB connection string
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set")

# Database name
DATABASE_NAME = (
    os.getenv("DATABASE_NAME")
    or os.getenv("MONGODB_DB_NAME")
    or os.getenv("DB_NAME")
    or "ContractEase"
)

# MongoDB connection pool / timeout settings
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000"))
MONGO_CONNECT_TIMEOUT_MS = int(os.getenv("MONGO_CONNECT_TIMEOUT_MS", "5000"))
MONGO_MAX_POOL_SIZE = int(os.getenv("MONGO_MAX_POOL_SIZE", "100"))
MONGO_MIN_POOL_SIZE = int(os.getenv("MONGO_MIN_POOL_SIZE", "10"))

# CORS — comma-separated allowed origins
# Added port 5500 variants for Live Server and 3000 for node-based servers
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5500,http://127.0.0.1:5500,"
        "http://localhost:5501,http://127.0.0.1:5501,"
        "https://contract-ease-2-0.vercel.app",
    ).split(",")
    if origin.strip()
]

# Server settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
