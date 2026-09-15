"""Adaptador del generador PDF compartido con FAMIMUEBLES APP."""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

APP_REPORT_PDF = Path(__file__).resolve().parent.parent / "FAMIMUEBLES APP" / "report_pdf.py"
_spec = importlib.util.spec_from_file_location("famimuebles_app_report_pdf", APP_REPORT_PDF)
if _spec is None or _spec.loader is None:
    raise ImportError(f"No se pudo cargar el generador compartido: {APP_REPORT_PDF}")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)


def make_pdf(
    informe: str,
    columns: list[str],
    rows: list[list[Any]],
    *,
    local: str = "Todos los locales",
    usuario: str = "Administrador",
    resumen: list[tuple[str, Any]] | None = None,
) -> bytes:
    """Genera el mismo PDF visual que reciben los reportes de Telegram."""
    return _module.crear_pdf_reporte(
        informe=informe,
        columnas=columns,
        filas=rows,
        resumen=resumen,
        local=local,
        usuario=usuario,
    )
