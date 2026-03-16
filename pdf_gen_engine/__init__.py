"""ContractEase PDF engine package.

This package provides a standalone service for rendering signed contract
payloads into PDF files using Jinja2 templates and WeasyPrint.
"""

import os
from pathlib import Path


def _bootstrap_windows_gtk_runtime() -> None:
    """Ensure GTK runtime DLLs are discoverable on Windows hosts."""
    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return

    gtk_bin = Path(r"C:\Program Files\GTK3-Runtime Win64\bin")
    if gtk_bin.exists():
        os.add_dll_directory(str(gtk_bin))


_bootstrap_windows_gtk_runtime()

from .services.pdf_service import generate_contract_pdf

__all__ = ["generate_contract_pdf"]
