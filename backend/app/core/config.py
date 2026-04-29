"""
Application configuration.
Reads settings from environment variables with sensible defaults.
"""

import os
from pathlib import Path

from dotenv import load_dotenv


# Load environment files deterministically regardless of where uvicorn is started.
_CONFIG_FILE = Path(__file__).resolve()
_BACKEND_ROOT = _CONFIG_FILE.parents[2]
_PROJECT_ROOT = _CONFIG_FILE.parents[3]

load_dotenv(_PROJECT_ROOT / ".env", override=False)
load_dotenv(_BACKEND_ROOT / ".env", override=False)


# MongoDB connection string
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

# Database name
DATABASE_NAME = (
    os.getenv("DATABASE_NAME")
    or os.getenv("MONGODB_DB_NAME")
    or os.getenv("DB_NAME")
    or "ContractEase"
)

# MongoDB connection pool / timeout settings
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000"))
MONGO_CONNECT_TIMEOUT_MS = int(os.getenv("MONGO_CONNECT_TIMEOUT_MS", "10000"))
MONGO_SOCKET_TIMEOUT_MS = int(os.getenv("MONGO_SOCKET_TIMEOUT_MS", "20000"))
MONGO_MAX_POOL_SIZE = int(os.getenv("MONGO_MAX_POOL_SIZE", "100"))
MONGO_MIN_POOL_SIZE = int(os.getenv("MONGO_MIN_POOL_SIZE", "0"))
MONGO_MAX_IDLE_TIME_MS = int(os.getenv("MONGO_MAX_IDLE_TIME_MS", "300000"))

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
