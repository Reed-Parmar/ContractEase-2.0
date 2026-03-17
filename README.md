# ContractEase

## Description

ContractEase is a SaaS-style contract creation, signing, and PDF generation system.
It lets users create contracts, send them for client signature, and download finalized PDF copies.

## Features

- Contract creation
- Save and edit drafts
- Creator signature before sending
- Client signature
- PDF generation using WeasyPrint
- Dashboard management
- Currency support (₹, $, €)
- Date format (DD/MM/YYYY)

## Tech Stack

### Frontend

- HTML
- CSS
- JavaScript

### Backend

- FastAPI (Python)

### Database

- MongoDB

### PDF

- WeasyPrint

## Setup Instructions

1. Clone the repository.
2. Set up backend dependencies:
   - Create and activate a virtual environment.
   - Install packages from `backend/requirements.txt`.
3. Run the FastAPI server from the backend directory.
4. Open frontend pages from `frontend/pages/` in your browser.

## Test Workflow

Create → Draft → Edit → Send → Sign → Download

## Project Structure

- `backend/`
- `frontend/`
- `pdf_gen_engine/`
- `contracts_pdfs/`

## Notes

- On Windows, WeasyPrint requires GTK runtime dependencies.
- Generated PDFs are stored locally in `contracts_pdfs/`.
- This is a prototype system.

## Status

MVP Complete
