# ContractEase

ContractEase is a local-first contract authoring and e-signature workflow.
It supports contract drafting, sequential signatures, status transitions, and signed PDF generation.



## Architecture

1. Frontend
- Plain HTML/CSS/JavaScript in `frontend/`.

2. Backend
- FastAPI app in `backend/app/`.

3. Database
- MongoDB collections: `users`, `clients`, `contracts`, `signatures`.

4. PDF Engine
- Jinja2 + WeasyPrint implementation in `pdf_gen_engine/`.

5. PDF Storage
- Generated files are stored in `contracts_pdfs/`.

## Contract Lifecycle

Primary path:

1. Creator creates contract (`draft`)
2. Creator signs and sends (`sent`)
3. Client signs (`pending` lock during signing)
4. Signed PDF is generated and contract moves to `signed`
5. PDF becomes downloadable

Decline path:

1. Client declines after send
2. Contract moves to `declined`

## Core Behavior Rules

1. Client resolution
- Frontend calls `GET /clients/by-email` first.
- If that returns `404`, frontend creates a client with `POST /register/client`.

2. Signature order
- Creator signature must exist before send.
- Client signature finalizes contract and triggers PDF generation.

3. Email requirements
- Client email must be a valid user-supplied email address.

4. Numbering consistency
- Preview numbering is centralized in frontend logic.
- PDF templates use loop-based indexing to keep numbering stable.

## Tech Stack

Pinned backend dependencies are defined in `backend/requirements.txt`:

1. `fastapi==0.115.*`
2. `uvicorn[standard]==0.34.*`
3. `motor==3.6.0`
4. `pymongo==4.9.2`
5. `pydantic[email]==2.10.*`
6. `python-dotenv==1.0.*`
7. `jinja2==3.1.*`
8. `weasyprint==61.*`
9. `slowapi==0.1.*`
10. `email-validator==2.3.0`
11. `dnspython>=2.0.0,<3.0.0`

## Configuration

Backend config is loaded in `backend/app/core/config.py`.

Required for authenticated backend startup:

1. `AUTH_SECRET_KEY`
- Must be set to a non-default secret.
- Backend startup fails if missing or insecure.

Database and runtime config:

1. `MONGO_URI` (default: `mongodb://localhost:27017`)
2. `DATABASE_NAME` / `MONGODB_DB_NAME` / `DB_NAME` (default: `ContractEase`)
3. Mongo timeout/pool settings:
- `MONGO_SERVER_SELECTION_TIMEOUT_MS`
- `MONGO_CONNECT_TIMEOUT_MS`
- `MONGO_MAX_POOL_SIZE`
- `MONGO_MIN_POOL_SIZE`
4. `ALLOWED_ORIGINS` (comma-separated CORS allowlist)
5. `HOST` (default: `0.0.0.0`)
6. `PORT` (default: `8000`)

Frontend API base config:

- Defined in `frontend/js/config.js`.
- Uses `http://localhost:8000` on localhost and the deployed URL otherwise.

## Local Setup (Windows PowerShell)

From repository root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

Optional `.env` in repository root:

```env
MONGO_URI=mongodb://localhost:27017
DATABASE_NAME=ContractEase
AUTH_SECRET_KEY=replace-with-a-long-random-secret
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

Run backend:

```powershell
cd backend
..\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Run frontend static server from repository root:

```powershell
python -m http.server 5500
```

Open in browser:

1. `http://localhost:5500/frontend/pages/user-login.html`
2. `http://localhost:5500/frontend/pages/client-login.html`
3. `http://localhost:5500/frontend/pages/create-contract.html`

API docs:

1. Swagger UI: `http://localhost:8000/docs`
2. OpenAPI JSON: `http://localhost:8000/openapi.json`

## Scope

Active contract types in the current flow:

1. `house_sale`
2. `website_development`
3. `broker`
4. `nda`
5. `employment`

Compatibility note:

- Legacy stored contract types `license` and `service` are still accepted in API response models for backward compatibility with existing data.
- New creation/edit flows should use the active contract types listed above.

## Seed Data

Seed script at repository root:

```powershell
python seed.py
```

Notes:

- Loads environment variables from `.env`.
- Creates required indexes.
- Inserts sample users, clients, and contracts if missing.
- Safe to re-run (idempotent upsert behavior).

## API Endpoints

Health:

1. `GET /`
2. `GET /health`

Auth and registration (`backend/app/routes/register.py`):

1. `GET /clients/by-email`
2. `POST /register/user`
3. `POST /register/client`
4. `POST /login/user`
5. `POST /login/client`

Users/clients:

1. `POST /users/`
2. `POST /clients/`

Contracts (`backend/app/routes/contracts.py`):

1. `POST /contracts/`
2. `GET /contracts/user/{user_id}`
3. `GET /contracts/client/{client_id}`
4. `GET /contracts/{contract_id}`
5. `GET /contracts/{contract_id}/download`
6. `PATCH /contracts/{contract_id}`
7. `PATCH /contracts/{contract_id}/status`
8. `PUT /contracts/{contract_id}/send`

Signatures (`backend/app/routes/signatures.py`):

1. `POST /contracts/{contract_id}/sign`
2. `GET /contracts/{contract_id}/signature`

## Validation Notes

1. Contract type validation differs by context:
- Create/update expects active flow types.
- Response models also accept legacy `license`/`service` values.

2. Currency is validated as one of:
- `INR`, `USD`, `EUR` (stored symbols in API are `₹`, `$`, `€`)

3. `userId` and `clientId` must be valid Mongo `ObjectId` strings.

4. Contract template sections are validated by type:
- `houseSale`
- `websiteDevelopment`
- `brokerAgreement`
- `nda`
- `employment`

5. Email values use Pydantic `EmailStr` validation in auth/register payloads.

## Repository Structure

1. `backend/`
- FastAPI routes, services, models, and DB access.

2. `frontend/`
- Pages, styles, and browser-side contract/auth flows.

3. `pdf_gen_engine/`
- PDF template and rendering pipeline.

4. `contracts_pdfs/`
- Generated signed PDF artifacts.

5. `docs/`
- Implementation notes, audits, and reports.

## Troubleshooting

1. `404` from `/clients/by-email`
- Expected when a client does not exist yet.
- Frontend should follow with `/register/client`.

2. `422` from `/register/client`
- Typically invalid email format.

3. WeasyPrint issues on Windows
- Install required GTK/Pango/Cairo runtime dependencies.

4. CORS errors in browser
- Verify origin is present in `ALLOWED_ORIGINS`.
- Also check backend logs for hidden `500` exceptions; browser CORS messages can mask upstream failures.

5. Backend fails at startup with auth error
- Ensure `AUTH_SECRET_KEY` is set and not a known insecure placeholder.

## Current Status

ContractEase is an MVP with a stable local development workflow.
Primary coverage is active for house sale, website development, broker, NDA, and employment flows, while legacy contract records remain readable for compatibility.
