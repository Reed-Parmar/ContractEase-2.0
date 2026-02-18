You are assisting me in developing a college mini-project that is intentionally built like a real-world SaaS application, following good software engineering practices.

📌 Project Name

ContractEase – A Mobile-First Contract Creation and E-Signing Platform

📌 Problem Statement

Freelancers, students, and small businesses frequently face disputes and financial risk because creating clear, reliable contracts is too complex or inaccessible.

📌 Solution Overview

ContractEase is a mobile-first web platform that simplifies the entire contract lifecycle:

structured contract creation

safe customization using predefined clauses

secure sharing

digital signing

final signed PDF generation

The system:

does NOT provide legal advice

does NOT replace lawyers

focuses only on reducing friction and errors using templates and guided inputs

📌 Users & Roles (FINAL)

User / Creator

freelancer / student / startup / small business

creates and sends contracts

Client / Signer

receives and signs contracts

Constraints (Strict)

Both users must be logged in

One signer per contract only

No guest signing

Scope is intentionally limited for a mini project

📌 Core Features (FINAL SCOPE)

JWT-based authentication

Contract creation wizard

Contract type selection (NDA, freelance, etc.)

Predefined contract templates

Clause toggle system (ON/OFF only, no free-text legal writing)

Contract preview

Secure share link

Digital signature (typed or drawn)

Signature metadata (timestamp, signer identity)

Contract locking after signing

Final signed PDF generation

User & Client dashboards

📌 Tech Stack (FINAL & LOCKED)

Frontend

React + TypeScript

Vite

Tailwind CSS

Mobile-first UI

Backend

Python

FastAPI

Database

MongoDB

PDF Generation

WeasyPrint (HTML → PDF)

Other

REST APIs

JWT Authentication

📌 Project Folder Structure (MUST FOLLOW)
ContractEase/
│
├── frontend/                    # Vite + React + TypeScript
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── layouts/
│   │   │   ├── routes.tsx
│   │   │   └── styles/
│   │   ├── lib/
│   │   │   └── api.ts
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── backend/                     # FastAPI backend
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── db/
│   ├── requirements.txt
│   └── .env
│
├── diagrams/
├── docs/
└── README.md

📌 Frontend Best Practices (Follow These)

Treat UI as final (already generated via Figma)

Use component-based architecture

Keep API calls isolated in lib/api.ts

No business logic in UI components

Mobile-first layouts

Reusable components (cards, buttons, layouts)

📌 Backend Best Practices (Strict)

Use FastAPI modular architecture

Keep:

routes → API layer only

services → business logic

models → database structure

schemas → request/response validation

Use dependency injection

Keep endpoints thin and readable

No frontend logic in backend

📌 Software Engineering Principles

Separation of concerns

Modularity

Readability over cleverness

Honest scope (mini project, not enterprise)

Panel-friendly explanations

📌 What You Should NOT Suggest

AI legal advice

Smart contracts / blockchain

Multi-signer workflows

Enterprise-level compliance features

Over-engineering

📌 How You Should Help Me

Help me with:

FastAPI backend implementation

MongoDB schema design

API request/response design

Frontend ↔ backend integration

Debugging

Explaining architecture for viva/panel

Ask clarification questions only if absolutely necessary.
Otherwise, assume this context is final and locked.