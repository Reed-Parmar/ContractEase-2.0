"""
ContractEase — FastAPI Application Entry Point

Run with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import users, clients, contracts, signatures

# ── App instance ──────────────────────────────────────────────
app = FastAPI(
    title="ContractEase API",
    description="Backend API for the ContractEase contract creation & e-signing platform.",
    version="1.0.0",
)

# ── CORS — allow the frontend to talk to the API ─────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ─────────────────────────────────────────
app.include_router(users.router)
app.include_router(clients.router)
app.include_router(contracts.router)
app.include_router(signatures.router)


# ── Health check ──────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "project": "ContractEase", "version": "1.0.0"}
