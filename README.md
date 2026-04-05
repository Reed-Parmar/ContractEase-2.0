# ContractEase

ContractEase is a local-first contract authoring and e-sign flow for three supported contract types.
It provides form-driven contract drafting, sequential signatures, status transitions, and final PDF generation.

## Scope

The system currently supports only these contract types.

1. `house_sale`
2. `website_development`
3. `broker`

All API validation and frontend routing assume this fixed set.

## High-Level Architecture

1. Frontend
Plain HTML/CSS/JavaScript pages in `frontend/`.

2. Backend
FastAPI app in `backend/app/`.

3. Database
MongoDB collections: `users`, `clients`, `contracts`, `signatures`.

4. PDF Engine
Jinja2 + WeasyPrint in `pdf_gen_engine/`.

5. PDF Storage
Generated files are written to `contracts_pdfs/`.

## Contract Lifecycle

Primary flow:

1. Creator creates contract (status `draft`)
2. Creator signs and sends (status `sent`)
3. Client signs (status lock via `pending`)
4. System generates final PDF and marks `signed`
5. PDF becomes downloadable

Decline path:

1. Client can decline after send
2. Status becomes `declined`

## Key Behavior Rules

1. Client Resolution
Frontend always tries `GET /clients/by-email` first.
If response is `404`, frontend creates client using `POST /register/client`.

2. Email Requirement
Client email must be a user-supplied valid email address before send.
Do not rely on hidden default emails.

3. Numbering Consistency
Preview section numbering is centralized in frontend JS.
PDF templates use loop indexing so headings render as `1. Title`, `2. Title`, etc.

4. Signature Order
Creator signature must exist before send.
Client signature finalizes contract and triggers PDF generation.

## Tech Stack

Backend packages are pinned in `backend/requirements.txt`.

1. `fastapi==0.115.*`
2. `uvicorn[standard]==0.34.*`
3. `motor==3.6.*`
4. `pydantic[email]==2.10.*`
5. `jinja2==3.1.*`
6. `weasyprint==61.*`
7. `pydyf==0.10.0`

## Configuration

Configured in `backend/app/core/config.py`.

1. `MONGO_URI` (default `mongodb://localhost:27017`)
2. `DATABASE_NAME` (default `ContractEase`)
3. Pool/timeouts for Mongo client
4. `ALLOWED_ORIGINS` for frontend CORS
5. `HOST` (default `0.0.0.0`)
6. `PORT` (default `8000`)

Frontend API base URL is in `frontend/js/config.js`.

1. `API_BASE = 'http://localhost:8000'`

## Local Setup (Windows PowerShell)

From repository root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

Run backend:

```powershell
cd backend
..\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Run frontend static server from repo root:

```powershell
python -m http.server 5500
```

Open in browser:

1. Contract type selection: `http://localhost:5500/frontend/pages/create-contract.html`
2. House sale form: `http://localhost:5500/frontend/pages/create-contract-house-sale.html`
3. Website development form: `http://localhost:5500/frontend/pages/create-contract-website-development.html`
4. Broker form: `http://localhost:5500/frontend/pages/create-contract-broker.html`

API docs:

1. Swagger UI: `http://localhost:8000/docs`
2. OpenAPI JSON: `http://localhost:8000/openapi.json`

## 🚀 Setup Instructions

1. Clone the repository.

2. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

3. Create `.env` file in project root:
```env
MONGO_URI=mongodb://localhost:27017
DB_NAME=contractease
```

4. Start MongoDB locally.

5. Run seed script:
```bash
python seed.py
```

6. Start backend:
```bash
cd backend
uvicorn app.main:app --reload
```

### Seed Script Notes

- `seed.py` loads environment variables from `.env`.
- It creates Mongo indexes needed by the app startup flow.
- It inserts sample users, clients, and draft contracts (house_sale, website_development, broker).
- It skips existing records using email- and key-based checks, so re-running is safe.

## API Endpoint Inventory

Health:

1. `GET /`

Registration and login routes (`backend/app/routes/register.py`):

1. `GET /clients/by-email`
2. `POST /register/user`
3. `POST /register/client`
4. `POST /login/user`
5. `POST /login/client`

User and client CRUD-lite:

1. `POST /users/`
2. `POST /clients/`

Contract routes (`backend/app/routes/contracts.py`):

1. `POST /contracts/`
2. `GET /contracts/user/{user_id}`
3. `GET /contracts/client/{client_id}`
4. `GET /contracts/{contract_id}`
5. `GET /contracts/{contract_id}/download`
6. `PATCH /contracts/{contract_id}`
7. `PATCH /contracts/{contract_id}/status`
8. `PUT /contracts/{contract_id}/send`

Signature routes (`backend/app/routes/signatures.py`):

1. `POST /contracts/{contract_id}/sign`
2. `GET /contracts/{contract_id}/signature`

## Validation Constraints

1. Contract type must be one of `house_sale`, `website_development`, `broker`.
2. Currency must be one of `₹`, `$`, `€`.
3. `userId` and `clientId` must be valid Mongo `ObjectId` strings.
4. Website-development payload requires `templateData.websiteDevelopment` with required fields.
5. Broker payload requires `templateData.brokerAgreement` with required fields.
6. House-sale payload requires `templateData.houseSale` with required fields.
7. Client email must pass Pydantic `EmailStr` validation.

## Repository Structure

1. `backend/`
FastAPI app, data models, Mongo access, route handlers.

2. `frontend/`
Pages, styles, and browser-side contract/signing logic.

3. `pdf_gen_engine/`
Template context builders and WeasyPrint pipeline.

4. `contracts_pdfs/`
Generated signed contract artifacts.

5. `docs/`
Implementation notes, audits, and reports.

## Troubleshooting

1. Error `404` on `/clients/by-email`
Expected when client does not exist.
Frontend should then call `/register/client`.

2. Error `422` on `/register/client`
Usually invalid email format.
Use a real domain email like `name@example.com`.

3. Error `[object Object]` in frontend logs
Means error payload was stringified poorly in older builds.
Hard refresh browser and verify latest `frontend/js/contract.js` is loaded.

4. WeasyPrint failures on Windows
Install required native GTK/Pango/Cairo runtime.
Python package install alone is not always sufficient.

5. CORS issues
Ensure frontend origin is included in `ALLOWED_ORIGINS`.

## Current Status

The project is a focused MVP for the three supported contract types above.
Unsupported contract types and legacy pages were intentionally removed from the active flow.
