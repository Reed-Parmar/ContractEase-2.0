"""
ContractEase — Database Seed Script (n05)

Removes ALL existing records from users, clients, contracts and signatures
collections, then inserts a clean, diverse test dataset:

  3 users   × 3 clients = 3 matched pairs
  3 contracts per pair  = 9 contracts total
  Unique signature records for every "signed" contract

Run with:
    cd backend
    python seed.py
"""

import asyncio
import base64
import hashlib
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

# ── Connection settings ───────────────────────────────────────
MONGO_URI = "mongodb://localhost:27017"
DATABASE_NAME = "ContractEase"

client = AsyncIOMotorClient(MONGO_URI)
db = client[DATABASE_NAME]

users_col      = db["users"]
clients_col    = db["clients"]
contracts_col  = db["contracts"]
signatures_col = db["signatures"]

# ── Helper ────────────────────────────────────────────────────

def now_utc(offset_days: int = 0) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=offset_days)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def _make_sketch_png(label: str) -> str:
    """
    Build a tiny deterministic 1×1 PNG whose colour is derived from
    the label string.  This gives each signature a unique image without
    requiring an actual canvas draw.  The result is a valid Base64
    data-URL that can be stored in the signatures collection.
    """
    digest = hashlib.md5(label.encode()).hexdigest()
    r, g, b = int(digest[0:2], 16), int(digest[2:4], 16), int(digest[4:6], 16)

    # Minimal valid 1×1 PNG (hard-coded structure, only RGB bytes change)
    def make_png(r, g, b):
        import zlib, struct

        def png_chunk(chunk_type, data):
            c = chunk_type + data
            return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

        header   = b'\x89PNG\r\n\x1a\n'
        ihdr     = png_chunk(b'IHDR', struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        raw      = b'\x00' + bytes([r, g, b])
        idat     = png_chunk(b'IDAT', zlib.compress(raw))
        iend     = png_chunk(b'IEND', b'')
        return header + ihdr + idat + iend

    png_bytes = make_png(r, g, b)
    b64       = base64.b64encode(png_bytes).decode()
    return f"data:image/png;base64,{b64}"


async def seed() -> None:
    # ── Wipe existing data ────────────────────────────────────
    print("Clearing existing data…")
    await users_col.drop()
    await clients_col.drop()
    await contracts_col.drop()
    await signatures_col.drop()

    # Re-create unique index on users.email
    await users_col.create_index("email", unique=True)
    await clients_col.create_index("email", unique=True)

    print("Old data removed. Inserting seed data…")

    # ── Users ─────────────────────────────────────────────────
    user_docs = [
        {
            "_id": ObjectId(),
            "name": "Alice Bennett",
            "email": "alice@example.com",
            "password": "password123",
            "role": "user",
            "createdAt": now_utc(-30),
        },
        {
            "_id": ObjectId(),
            "name": "Bob Clarke",
            "email": "bob@example.com",
            "password": "password123",
            "role": "user",
            "createdAt": now_utc(-20),
        },
        {
            "_id": ObjectId(),
            "name": "Carol Davis",
            "email": "carol@example.com",
            "password": "password123",
            "role": "user",
            "createdAt": now_utc(-10),
        },
    ]
    await users_col.insert_many(user_docs)
    print(f"  ✓ Inserted {len(user_docs)} users")

    # ── Clients ───────────────────────────────────────────────
    client_docs = [
        {
            "_id": ObjectId(),
            "name": "TechCorp Ltd",
            "email": "techcorp@example.com",
            "password": "password123",
            "role": "client",
            "createdAt": now_utc(-25),
        },
        {
            "_id": ObjectId(),
            "name": "BuildCo Industries",
            "email": "buildco@example.com",
            "password": "password123",
            "role": "client",
            "createdAt": now_utc(-15),
        },
        {
            "_id": ObjectId(),
            "name": "MediaWorks Agency",
            "email": "mediaworks@example.com",
            "password": "password123",
            "role": "client",
            "createdAt": now_utc(-5),
        },
    ]
    await clients_col.insert_many(client_docs)
    print(f"  ✓ Inserted {len(client_docs)} clients")

    # ── Build contract + signature pairs ──────────────────────
    # 3 matched pairs → 3 contracts each
    #   Statuses per pair: signed, sent, declined

    pairs = [
        (user_docs[0], client_docs[0]),  # Alice  → TechCorp
        (user_docs[1], client_docs[1]),  # Bob    → BuildCo
        (user_docs[2], client_docs[2]),  # Carol  → MediaWorks
    ]

    contract_templates = [
        {
            "title_prefix":   "Service Agreement",
            "type":           "service",
            "description":    "Professional consulting and advisory services.",
            "amount":         8500.00,
            "due_offset":     30,
            "status":         "signed",
            "clauses":        {"payment": True, "liability": True, "confidentiality": True, "termination": False},
        },
        {
            "title_prefix":   "NDA Agreement",
            "type":           "nda",
            "description":    "Non-disclosure agreement covering proprietary information.",
            "amount":         0.00,
            "due_offset":     60,
            "status":         "sent",
            "clauses":        {"payment": False, "liability": False, "confidentiality": True, "termination": True},
        },
        {
            "title_prefix":   "License Agreement",
            "type":           "license",
            "description":    "Software license and usage rights.",
            "amount":         3200.00,
            "due_offset":     -5,            # past due
            "status":         "declined",
            "clauses":        {"payment": True, "liability": True, "confidentiality": False, "termination": True},
        },
    ]

    contract_docs  = []
    signature_docs = []

    for user_doc, client_doc in pairs:
        for tmpl in contract_templates:
            due_dt    = now_utc(tmpl["due_offset"])
            created   = now_utc(-14)
            signed_dt = now_utc(-2) if tmpl["status"] == "signed" else None

            contract = {
                "_id":         ObjectId(),
                "title":       f"{tmpl['title_prefix']} — {user_doc['name']} / {client_doc['name']}",
                "type":        tmpl["type"],
                "description": tmpl["description"],
                "amount":      tmpl["amount"],
                "dueDate":     due_dt,
                "clauses":     tmpl["clauses"],
                "status":      tmpl["status"],
                "userId":      user_doc["_id"],
                "userName":    user_doc["name"],
                "userEmail":   user_doc["email"],
                "clientId":    client_doc["_id"],
                "clientName":  client_doc["name"],
                "clientEmail": client_doc["email"],
                "createdAt":   created,
                "signedAt":    signed_dt,
            }
            contract_docs.append(contract)

            if tmpl["status"] == "signed":
                sig_label = f"{client_doc['email']}_{str(contract['_id'])}"
                signature_docs.append({
                    "_id":            ObjectId(),
                    "contractId":     str(contract["_id"]),
                    "signerName":     client_doc["name"],
                    "signerEmail":    client_doc["email"],
                    "signatureImage": _make_sketch_png(sig_label),
                    "signedAt":       signed_dt,
                })

    await contracts_col.insert_many(contract_docs)
    print(f"  ✓ Inserted {len(contract_docs)} contracts")

    await signatures_col.insert_many(signature_docs)
    print(f"  ✓ Inserted {len(signature_docs)} signatures")

    # ── Summary ───────────────────────────────────────────────
    print()
    print("━" * 50)
    print("Seed complete. Login credentials:")
    print()
    print("USERS (→ user-login.html)")
    for u in user_docs:
        print(f"  {u['email']}  /  password123")
    print()
    print("CLIENTS (→ client-login.html)")
    for c in client_docs:
        print(f"  {c['email']}  /  password123")
    print("━" * 50)

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
