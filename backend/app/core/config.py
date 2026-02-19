"""
Application configuration.
Reads settings from environment variables with sensible defaults.
"""

import os


# MongoDB connection string — defaults to local instance
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

# Database name
DATABASE_NAME = os.getenv("DATABASE_NAME", "contractease")

# Server settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
