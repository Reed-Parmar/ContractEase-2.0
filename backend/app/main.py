"""
ContractEase — FastAPI Application Entry Point

Run with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import ALLOWED_ORIGINS
from app.db.mongo import close_mongo_connection
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
