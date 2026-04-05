"""ContractEase root database seed script.

This script inserts sample users, clients, and contracts for local setup
without duplicating existing data.

Run from repository root:
    python seed.py
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import os
from typing import Any

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


def _utc_in_days(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def _db_name_from_env() -> str:
    return (
        os.getenv("DATABASE_NAME")
        or os.getenv("MONGODB_DB_NAME")
        or os.getenv("DB_NAME")
        or "ContractEase"
    )


async def _ensure_indexes(users_col, clients_col, contracts_col, signatures_col) -> None:
    await users_col.create_index("email", unique=True)
    await clients_col.create_index("email", unique=True)
    await contracts_col.create_index("userId")
    await contracts_col.create_index("clientId")
    await contracts_col.create_index("status")
    await contracts_col.create_index("type")
    await signatures_col.create_index("contractId")


async def _upsert_users(users_col) -> list[dict[str, Any]]:
    desired = [
        {
            "name": "Alice Bennett",
            "email": "alice.seed@example.com",
            "password": "password123",
            "role": "user",
        },
        {
            "name": "Bob Clarke",
            "email": "bob.seed@example.com",
            "password": "password123",
            "role": "user",
        },
    ]

    inserted = 0
    skipped = 0
    docs: list[dict[str, Any]] = []

    for item in desired:
        existing = await users_col.find_one({"email": item["email"]})
        if existing:
            skipped += 1
            docs.append(existing)
            continue

        doc = {
            **item,
            "createdAt": datetime.now(timezone.utc),
        }
        result = await users_col.insert_one(doc)
        doc["_id"] = result.inserted_id
        inserted += 1
        docs.append(doc)

    if inserted:
        print(f"Inserted users: {inserted}")
    if skipped:
        print(f"Skipped existing users: {skipped}")

    return docs


async def _upsert_clients(clients_col) -> list[dict[str, Any]]:
    desired = [
        {
            "name": "TechCorp Ltd",
            "email": "techcorp.seed@example.com",
            "password": "password123",
            "role": "client",
        },
        {
            "name": "BuildCo Industries",
            "email": "buildco.seed@example.com",
            "password": "password123",
            "role": "client",
        },
    ]

    inserted = 0
    skipped = 0
    docs: list[dict[str, Any]] = []

    for item in desired:
        existing = await clients_col.find_one({"email": item["email"]})
        if existing:
            skipped += 1
            docs.append(existing)
            continue

        doc = {
            **item,
            "createdAt": datetime.now(timezone.utc),
        }
        result = await clients_col.insert_one(doc)
        doc["_id"] = result.inserted_id
        inserted += 1
        docs.append(doc)

    if inserted:
        print(f"Inserted clients: {inserted}")
    if skipped:
        print(f"Skipped existing clients: {skipped}")

    return docs


def _contract_key(title: str, contract_type: str, user_id: ObjectId, client_id: ObjectId) -> dict[str, Any]:
    return {
        "title": title,
        "type": contract_type,
        "userId": user_id,
        "clientId": client_id,
    }


async def _upsert_contracts(contracts_col, users: list[dict[str, Any]], clients: list[dict[str, Any]]) -> None:
    if len(users) < 2 or len(clients) < 2:
        raise RuntimeError("Not enough users/clients available to seed contracts")

    templates = [
        {
            "title": "House Sale Agreement (Seed)",
            "type": "house_sale",
            "description": "Sample house sale contract for local setup.",
            "amount": 125000.00,
            "currency": "₹",
            "dueDate": _utc_in_days(30),
            "templateData": {
                "houseSale": {
                    "agreement_place": "Delhi",
                    "agreement_date": datetime.now(timezone.utc).date().isoformat(),
                    "vendor_name": users[0].get("name") or "Vendor",
                    "vendor_residence": "Delhi, India",
                    "purchaser_name": clients[0].get("name") or "Purchaser",
                    "purchaser_residence": "Mumbai, India",
                    "property_details": "Residential unit at Plot 17, Green Avenue, Delhi.",
                    "sale_price": 125000.00,
                    "earnest_money_amount": 12500.00,
                    "completion_period_months": 3,
                    "witness_1_name": "Witness One",
                    "witness_2_name": "Witness Two",
                }
            },
            "pair": (0, 0),
        },
        {
            "title": "Website Development Agreement (Seed)",
            "type": "website_development",
            "description": "Sample website development contract for local setup.",
            "amount": 9000.00,
            "currency": "₹",
            "dueDate": _utc_in_days(21),
            "templateData": {
                "websiteDevelopment": {
                    "agreement_place": "Bengaluru",
                    "company_name": users[1].get("name") or "Company",
                    "developer_name": clients[1].get("name") or "Developer",
                    "company_address": "Bengaluru, India",
                    "developer_address": "Pune, India",
                    "project_purpose": "Corporate website redesign and maintenance.",
                    "consultation_hours": 3,
                    "page_count": 15,
                    "web_page_word_count": 250,
                    "external_links_per_page": 2,
                    "masthead_graphic": "Included",
                    "photo_graphics_average": 1,
                    "update_period_months": 12,
                    "search_engine_publicity": True,
                    "email_response_enabled": True,
                    "image_map_enabled": False,
                    "fee_total": 9000,
                    "initial_payment_amount": 3000,
                    "mid_payment_amount": 3000,
                    "completion_payment_amount": 3000,
                    "content_due_days": 14,
                    "completion_months": 2,
                    "maintenance_months": 12,
                    "additional_graphics_fee": 300,
                    "transparency_fee": 150,
                    "hourly_rate": 250,
                    "continuation_fee_percent": 10,
                }
            },
            "pair": (1, 1),
        },
        {
            "title": "Broker Appointment Agreement (Seed)",
            "type": "broker",
            "description": "Sample broker contract for local setup.",
            "amount": 450000.00,
            "currency": "₹",
            "dueDate": _utc_in_days(14),
            "templateData": {
                "brokerAgreement": {
                    "agreement_place": "Hyderabad",
                    "owner_name": users[0].get("name") or "Owner",
                    "owner_residence": "Hyderabad, India",
                    "broker_name": clients[1].get("name") or "Broker",
                    "broker_residence": "Chennai, India",
                    "property_details": "Independent house at Sector 9, Hyderabad.",
                    "total_consideration": 450000,
                    "earnest_money_amount": 45000,
                    "balance_amount": 405000,
                    "completion_period_months": 4,
                    "broker_sale_period_months": 2,
                    "commission_rate": 2,
                    "commission_amount": 9000,
                    "witness_1_name": "Witness One",
                    "witness_2_name": "Witness Two",
                }
            },
            "pair": (0, 1),
        },
    ]

    inserted = 0
    skipped = 0

    for tmpl in templates:
        user = users[tmpl["pair"][0]]
        client = clients[tmpl["pair"][1]]

        title = tmpl["title"]
        ctype = tmpl["type"]
        user_id = user["_id"]
        client_id = client["_id"]

        query = _contract_key(title, ctype, user_id, client_id)
        existing = await contracts_col.find_one(query)
        if existing:
            skipped += 1
            continue

        doc = {
            "title": title,
            "type": ctype,
            "description": tmpl["description"],
            "amount": tmpl["amount"],
            "currency": tmpl["currency"],
            "dueDate": tmpl["dueDate"],
            "clauses": {
                "payment": True,
                "liability": False,
                "confidentiality": True,
                "termination": False,
            },
            "templateData": tmpl["templateData"],
            "signatures": {
                "creator": None,
                "client": None,
            },
            "status": "draft",
            "userId": user_id,
            "userName": user.get("name"),
            "userEmail": user.get("email"),
            "clientId": client_id,
            "clientName": client.get("name"),
            "clientEmail": client.get("email"),
            "createdAt": datetime.now(timezone.utc),
            "signedAt": None,
        }
        await contracts_col.insert_one(doc)
        inserted += 1

    if inserted:
        print(f"Inserted contracts: {inserted}")
    if skipped:
        print(f"Skipped existing contracts: {skipped}")


async def main() -> None:
    load_dotenv(dotenv_path=".env")

    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    db_name = _db_name_from_env()

    client = None
    try:
        client = AsyncIOMotorClient(mongo_uri)
        await client.admin.command("ping")
    except Exception as exc:
        print(f"MongoDB connection failed: {exc}")
        if client is not None:
            client.close()
        return

    db = client[db_name]
    users_col = db["users"]
    clients_col = db["clients"]
    contracts_col = db["contracts"]
    signatures_col = db["signatures"]

    try:
        await _ensure_indexes(users_col, clients_col, contracts_col, signatures_col)
        users = await _upsert_users(users_col)
        clients = await _upsert_clients(clients_col)
        await _upsert_contracts(contracts_col, users, clients)
        print("Seed complete")
    except Exception as exc:
        print(f"Seeding failed: {exc}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
