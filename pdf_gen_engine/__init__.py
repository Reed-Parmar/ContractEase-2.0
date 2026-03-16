"""ContractEase PDF engine package.

This package provides a standalone service for rendering signed contract
payloads into PDF files using Jinja2 templates and WeasyPrint.
"""

from .services.pdf_service import generate_contract_pdf
import os
os.add_dll_directory(r"C:\Program Files\GTK3-Runtime Win64\bin")

__all__ = ["generate_contract_pdf"]
