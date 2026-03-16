# ContractEase: PDF Generation Engine & Secure Download Implementation Plan

## 1. Repository Analysis

Based on the repository structure, ContractEase is built with a clear separation of concerns:
- **Frontend:** Vanilla HTML/CSS/JS architecture located in the `frontend/` directory. Pages are separated for client/user experiences (`pages/`), supported by modular styles (`css/`) and dedicated logic (`js/`).
- **Backend:** A FastAPI application (`backend/app/`) connected to MongoDB.
  - **Models (`models/`):** Defines the data structures (`client.py`, `contract.py`, `signature.py`, `user.py`).
  - **Routes (`routes/`):** Exposes API endpoints (`clients.py`, `contracts.py`, `register.py`, `signatures.py`, `users.py`).
  - **Core/DB:** Handles configuration and database connections.

**Integration Point:** The PDF engine should integrate primarily into the backend's signature processing flow (`routes/signatures.py`), utilizing a new dedicated service layer for PDF generation. The frontend `sign-contract.html` and `contract.js` will handle the trigger and subsequent download.

## 2. Current Contract Lifecycle

Currently, contracts move through the following stages:
1. **Draft:** Created by the freelancer (User).
2. **Sent / Pending Signature:** Shared with the Client for review.
3. **Signed:** The client reviews the contract on `sign-contract.html`, draws their signature on an HTML Canvas, and submits it. The signature is captured as a Base64 PNG and sent to the backend.

**Required Changes:** 
To support finalized PDF generation, the lifecycle must be extended. When moving to the **Signed** state, the backend must instantly intercept the request, validate the signature, lock the contract from further edits, and trigger the PDF Document Generation before returning a success response to the client.

## 3. Optimal PDF Generation Architecture

The architecture will utilize **Jinja2** for templating and **WeasyPrint** for PDF rendering:

1. **HTML Contract Templates:** A standard HTML file mapping the contract's structure.
2. **Print CSS:** A dedicated CSS file (`@page` rules, print margins, clean typography) to ensure the HTML renders as a professional document.
3. **Template Rendering (Jinja2):** The backend injects MongoDB document data (freelancer info, client info, terms, signature Base64 string, timestamps) into the Jinja2 template.
4. **PDF Generation (WeasyPrint):** WeasyPrint processes the rendered HTML/CSS and converts it into a binary PDF buffer.
5. **Storage:** The PDF is saved securely to the server's filesystem or cloud storage.
6. **Return Download Response:** The backend updates the contract record with the PDF path/URL and returns a download link to the frontend.

## 4. File and Folder Structure Plan

To keep the FastAPI application modular and clean, new components should be placed as follows:

```text
backend/
	app/
		templates/
			contracts/
				contract_template.html     <-- Jinja2 template for the PDF layout
		static/
			pdf_styles/
				contract_print.css         <-- Print-optimized CSS for WeasyPrint
		services/
			__init__.py
			pdf_service.py             <-- Dedicated logic for Jinja2 + WeasyPrint
		utils/
			security.py                <-- Basic standard file hashing/validation
```
*Reasoning:* Separating the `pdf_service.py` from the `routes/` keeps the controllers thin. `templates/` and `static/` naturally fit standard web frameworks for rendering static assets.

## 5. Backend Implementation Plan

1. **Service Layer (`pdf_service.py`):**
   - Implement `generate_contract_pdf(contract_data, signature_data)`
   - Set up Jinja2 Environment to load `contract_template.html`.
   - Compile HTML strings and pass them to WeasyPrint.
2. **FastAPI Routes (`routes/signatures.py` & `routes/contracts.py`):**
   - On signature submission, transition state from `pending_signature` to `finalized`.
   - Call `generate_contract_pdf` synchronously (or via BackgroundTasks).
   - Add a new route: `GET /contracts/{contract_id}/download` that serves the PDF file using `FileResponse`.
3. **MongoDB Integration (`models/contract.py`):**
   - Add fields for `pdf_generated_at` (datetime), `pdf_file_path` (string), and `pdf_hash` (string) to the Contract schema.

## 6. Frontend Integration Plan

1. **Signature Submission (`frontend/js/api.js` & `contract.js`):**
   - The user signs on `sign-contract.html` and submits.
   - The API payload includes the Base64 PNG.
2. **Receiving Download URL:**
   - The backend responds with `{ "status": "success", "downloadUrl": "/api/contracts/123/download" }`.
3. **Triggering Automatic Download:**
   - The frontend catches the success response.
   - Displays a success modal ("Contract Signed Successfully! Downloading...").
   - Triggers the download automatically using a hidden anchor tag or `window.location.href = downloadUrl`.

## 7. Basic Security Measures (Lightweight)

- **Ownership Verification:** The `/contracts/{contract_id}/download` endpoint must verify the requester’s JWT token. Only the Freelancer (Creator) or the linked Client (Signee) can access the file.
- **Immutability:** Once a contract is marked `finalized`, the update/edit internal endpoints must reject any changes.
- **Duplicate Prevention:** If `pdf_file_path` already exists on the contract document, the signature submission endpoint should reject new signatures to prevent overwriting.
- **Path Traversal Protection:** Ensure the download endpoint strictly sanitizes the requested file path, only serving files from the designated secure PDF directory.

## 8. Optional Enhancements (Recommended)

- **PDF SHA256 Hash:** Calculate the SHA256 hash of the generated PDF buffer and store it in MongoDB. Include it in the UI as a "Tamper-Proof Verification Hash".
- **Download Token Expiration:** Instead of permanent URLs, generate a short-lived URL or JWT (e.g., valid for 5 minutes) for the download link to prevent link sharing.
- **Standardized Naming Convention:** Enforce clean filenames for downloads: `Contract_<FreelancerName>_<ClientName>_<YYYY-MM-DD>.pdf`.
- **Waterpointing/Metadata:** Use WeasyPrint's capabilities to embed author metadata inside the PDF file.

## 9. Edge Cases

- **Invalid Signature Data:** If the Canvas Base64 string is corrupt or empty, the backend must reject it *before* running WeasyPrint.
- **PDF Generation Failure:** Wrap WeasyPrint in a `try/except` block. If it fails, rollback the signature state to `pending_signature` so the client can try again without leaving the contract locked in a broken state.
- **Concurrent Signing Attempts:** Use MongoDB atomic operations (e.g., `find_one_and_update` with status check) to ensure two users cannot sign the same contract simultaneously.
- **Download Interruption:** Standard `FileResponse` streams the file. If interrupted, the user can re-trigger the download from their dashboard.

## 10. Performance Considerations

- **WeasyPrint CPU Usage:** WeasyPrint is computationally heavy and blocks the main thread. 
- **Threading:** Because FastAPI is asynchronous, running WeasyPrint synchronously will block the event loop, causing other API requests to hang. 
- **Solution:** Use `asyncio.to_thread()` or FastAPI's `BackgroundTasks` to offload the PDF generation to a worker thread, keeping the API responsive.

## 11. Implementation Roadmap

- **Phase 1: Database & Model Updates**
  - Update `models/contract.py` to support `status='finalized'`, `pdf_file_path`, and `pdf_hash`.
- **Phase 2: Add Templates & Styles**
  - Create `contract_template.html` and `contract_print.css`.
  - Ensure local mapping of Base64 signature images works in HTML.
- **Phase 3: Develop PDF Service**
  - Implement `services/pdf_service.py` with Jinja2 and WeasyPrint functionality.
  - Write a standalone test script to verify PDF outputs look correct.
- **Phase 4: Integrate with Signature Route**
  - Update `routes/signatures.py` to invoke the PDF service upon successful signature validation.
  - Save the resulting file and update the database.
- **Phase 5: Implement Download Endpoint**
  - Create the secure `GET /download` route ensuring auth checks.
- **Phase 6: Frontend Triggers & UI Updates**
  - Update `sign-contract.html` to handle the new backend response.
  - Implement the auto-download mechanism in `contract.js`.
  - Add download buttons to the client and user dashboards for historical access.
- **Phase 7: Review & Error Handling**
  - Add `asyncio.to_thread()` wrapping for WeasyPrint.
  - Test edge cases (concurrent signatures, missing data).
