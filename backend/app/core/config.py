"""
Application configuration.
Reads settings from environment variables with sensible defaults.
"""

import os


# MongoDB connection string — defaults to local instance
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

# Database name
DATABASE_NAME = os.getenv("DATABASE_NAME", "ContractEase")

# MongoDB connection pool / timeout settings
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000"))
MONGO_CONNECT_TIMEOUT_MS = int(os.getenv("MONGO_CONNECT_TIMEOUT_MS", "5000"))
MONGO_MAX_POOL_SIZE = int(os.getenv("MONGO_MAX_POOL_SIZE", "100"))
MONGO_MIN_POOL_SIZE = int(os.getenv("MONGO_MIN_POOL_SIZE", "10"))

# CORS — comma-separated allowed origins (empty or "*" disables credentials)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:5500").split(",")
    if origin.strip()
]

# Server settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
