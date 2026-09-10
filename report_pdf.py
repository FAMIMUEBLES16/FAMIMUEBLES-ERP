"""Generador de reportes PDF para FAMIMUEBLES ERP."""
from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent
LOGO_PATH = ROOT / "Logo Famimuebles.png"
PRIMARY = colors.HexColor("#174A96")
DARK = colors.HexColor("#0F3D82")
TEXT = colors.HexColor("#263238")
MUTED = colors.HexColor("#667085")
BORDER = colors.HexColor("#D9E1EE")
ROW_ALT = colors.HexColor("#F7F9FC")


def money(value: Any) -> str:
    try:
        return f"$ {float(value):,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return str(value or "")


def clean(value: Any) -> str:
    return (str(value if value is not None else "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


def make_pdf(informe: str, columns: list[str], rows: list[list[Any]], *, local: str = "Todos los locales", usuario: str = "Administrador", resumen: list[tuple[str, Any]] | None = None) -> bytes:
    styles = getSampleStyleSheet()
    title = ParagraphStyle("report-title", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, textColor=DARK, spaceAfter=3 * mm)
    meta = ParagraphStyle("report-meta", parent=styles["BodyText"], fontSize=8, textColor=MUTED, leading=10)
    header = ParagraphStyle("report-header", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8, textColor=colors.white, alignment=TA_CENTER)
    cell = ParagraphStyle("report-cell", parent=styles["BodyText"], fontSize=7.5, textColor=TEXT, leading=9)
    right = ParagraphStyle("report-right", parent=cell, alignment=TA_RIGHT)
    elements: list[Any] = []
    brand = "FAMIMUEBLES"
    if LOGO_PATH.exists():
        brand = f"{brand}  |  {LOGO_PATH.name}"
    elements.append(Paragraph(brand, title))
    elements.append(Paragraph(f"{clean(informe)} · Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')} · Local: {clean(local)} · Usuario: {clean(usuario)}", meta))
    elements.append(Spacer(1, 5 * mm))
    summary = resumen or [("Registros", len(rows)), ("Valor total", money(sum(float(row[-1]) for row in rows if row and isinstance(row[-1], (int, float)))))]
    cards = [[Paragraph(f"<b>{clean(label).upper()}</b><br/><font size=14 color='#0F3D82'><b>{clean(value)}</b></font>", cell) for label, value in summary[:4]]]
    card_table = Table(cards, colWidths=[190 * mm / max(1, len(cards[0]))])
    card_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ROW_ALT), ("BOX", (0, 0), (-1, -1), .5, BORDER), ("INNERGRID", (0, 0), (-1, -1), .3, BORDER), ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm), ("TOPPADDING", (0, 0), (-1, -1), 3 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm)]))
    elements.extend([card_table, Spacer(1, 5 * mm)])
    data = [[Paragraph(clean(column), header) for column in columns]]
    for row in rows:
        data.append([Paragraph(clean(value), right if isinstance(value, (int, float)) else cell) for value in row])
    table = Table(data, repeatRows=1, hAlign="LEFT")
    commands = [("BACKGROUND", (0, 0), (-1, 0), DARK), ("LINEBELOW", (0, 1), (-1, -1), .35, BORDER), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm), ("TOPPADDING", (0, 0), (-1, -1), 2.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5 * mm)]
    for index in range(2, len(data), 2):
        commands.append(("BACKGROUND", (0, index), (-1, index), ROW_ALT))
    table.setStyle(TableStyle(commands))
    elements.append(table)
    buffer = io.BytesIO()
    SimpleDocTemplate(buffer, pagesize=letter, rightMargin=12 * mm, leftMargin=12 * mm, topMargin=12 * mm, bottomMargin=14 * mm).build(elements)
    return buffer.getvalue()
