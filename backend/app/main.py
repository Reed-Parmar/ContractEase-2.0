"""
ContractEase — FastAPI Application Entry Point

Run with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import ALLOWED_ORIGINS, DATABASE_NAME, MONGO_URI
from app.db.mongo import close_mongo_connection, users_collection, clients_collection
from app.routes import users, clients, contracts, signatures, register

# ── App instance ──────────────────────────────────────────────
app = FastAPI(
    title="ContractEase API",
    description="Backend API for the ContractEase contract creation & e-signing platform.",
    version="1.0.0",
)

# ── CORS — allow the frontend to talk to the API ─────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup: ensure database indexes ─────────────────────────
@app.on_event("startup")
async def ensure_indexes():
    """Create required database indexes on startup (idempotent)."""
    print(f"[startup] Mongo target DB: {DATABASE_NAME}")
    print(f"[startup] Mongo URI: {MONGO_URI}")
    # Unique email index on users collection (n04 fix)
    await users_collection.create_index("email", unique=True)
    # Unique email index on clients collection (already enforced, kept for safety)
    await clients_collection.create_index("email", unique=True)


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
