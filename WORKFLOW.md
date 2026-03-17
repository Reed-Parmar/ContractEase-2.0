# ContractEase Workflow

## Contract Lifecycle

Create → Draft → Sign → Send → Client Sign → PDF → Download

## Status Flow

draft → pending → signed → declined

Implementation note: the system also uses `sent` as the active waiting state before final client signing.

## PDF Flow

Signing → generate_contract_pdf → WeasyPrint → store → download

## Signing Flow

- Creator signs first
- Client signs second

## Storage

MongoDB + contracts_pdfs/

## Summary

ContractEase follows a practical e-sign workflow that mimics real SaaS tools like DocuSign, including draft handling, sequential signatures, status tracking, and downloadable final PDFs.
