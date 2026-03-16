"""Configuration constants for the PDF generation engine.

Paths are resolved from this module location and can be overridden with
environment variables when needed.
"""

from __future__ import annotations

import os
from pathlib import Path


PDF_ENGINE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PDF_ENGINE_ROOT.parent

PDF_TEMPLATE_PATH = Path(
    os.getenv(
        "PDF_TEMPLATE_PATH",
        PDF_ENGINE_ROOT / "templates" / "contract_template.html",
    )
).resolve()

PDF_STYLE_PATH = Path(
    os.getenv(
        "PDF_STYLE_PATH",
        PDF_ENGINE_ROOT / "styles" / "pdf_styles.css",
    )
).resolve()

PDF_STORAGE_PATH = Path(
    os.getenv(
        "PDF_STORAGE_PATH",
        REPO_ROOT / "contracts_pdfs",
    )
).resolve()

PDF_FILE_PREFIX = os.getenv("PDF_FILE_PREFIX", "contract")
