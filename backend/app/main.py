"""
ContractEase — FastAPI Application Entry Point

Run with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

from app.core.config import ALLOWED_ORIGINS, DATABASE_NAME
from app.db.mongo import (
    close_mongo_connection,
    users_collection,
    clients_collection,
    contracts_collection,
    signatures_collection,
)
from app.routes import users, clients, contracts, signatures, register

# ── App instance with rate limiting ──────────────────────
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="ContractEase API",
    description="Backend API for the ContractEase contract creation & e-signing platform.",
    version="1.0.0",
)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again later."},
    )

# ── CORS — restrict to specific allowed origins ──────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


# ── Startup: ensure database indexes ─────────────────────────
@app.on_event("startup")
async def ensure_indexes():
    """Create required database indexes on startup (idempotent)."""
    print(f"[startup] Mongo target DB: {DATABASE_NAME}")

    # Users
    await users_collection.create_index("email", unique=True)

    # Clients
    await clients_collection.create_index("email", unique=True)

    # Contracts
    await contracts_collection.create_index("userId")
    await contracts_collection.create_index("clientId")
    await contracts_collection.create_index("status")
    await contracts_collection.create_index("type")

    # Signatures
    await signatures_collection.create_index("contractId")

    print("[startup] Indexes ensured")


# ── Shutdown ──────────────────────────────────────────────────
@app.on_event("shutdown")
async def shutdown_event():
    await close_mongo_connection()

# ── Register routers ─────────────────────────────────────────
app.include_router(users.router)
app.include_router(clients.router)
app.include_router(contracts.router)
app.include_router(signatures.router)
app.include_router(register.router)


# ── Health check ──────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "project": "ContractEase", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
