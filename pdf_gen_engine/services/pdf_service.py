"""Core PDF generation service for finalized contracts.

The service is intentionally framework-agnostic so route handlers can import
and reuse it without coupling PDF logic to FastAPI endpoints.
"""

from __future__ import annotations

from typing import Literal, Mapping

from ..config import PDF_STYLE_PATH
from ..utils.pdf_utils import (
    build_contract_template_context,
    build_pdf_output_path,
    ensure_pdf_storage_dir,
    render_contract_template,
)

PdfOutputMode = Literal["path", "bytes"]
def generate_contract_pdf(
    contract_data: Mapping[str, Any],
    output_mode: PdfOutputMode = "path",
) -> str | bytes:
    """Generate a contract PDF from dictionary payload data.

    Args:
        contract_data: Contract fields used in template rendering.
        output_mode: "path" to save and return file path, "bytes" to return binary.

    Returns:
        A string file path when output_mode is "path", otherwise PDF bytes.
    """
    contract_type = str(contract_data.get("type") or "").strip().lower()
    context = build_contract_template_context(contract_data)
    template_name = "house_sale.html" if contract_type == "house_sale" else None
    rendered_html = render_contract_template(context, template_name=template_name)

    try:
        from weasyprint import CSS, HTML
    except Exception as error:  # pragma: no cover - depends on host OS libs
        raise RuntimeError(
            "WeasyPrint is installed but native libraries are missing. "
            "Install GTK/Pango/Cairo runtime dependencies for this OS before generating PDFs."
        ) from error

    stylesheets = [CSS(filename=str(PDF_STYLE_PATH))]
    html = HTML(string=rendered_html, base_url=str(PDF_STYLE_PATH.parent))

    if output_mode == "bytes":
        return html.write_pdf(stylesheets=stylesheets)

    output_dir = ensure_pdf_storage_dir()
    output_path = build_pdf_output_path(contract_data, output_dir)
    html.write_pdf(target=str(output_path), stylesheets=stylesheets)
    return str(output_path)
