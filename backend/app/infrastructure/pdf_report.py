from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Helvetica ne contient que le jeu Windows-1252 : on remplace les symboles courants qui en sortent.
_REPLACE = {"→": "->", "←": "<-", "≥": ">=", "≤": "<=", "✓": "OK", "✔": "OK", "✗": "x", "•": "-",
            "…": "...", " ": " ", " ": " ", "≠": "!="}


def _safe(text: str) -> str:
    for a, b in _REPLACE.items():
        text = text.replace(a, b)
    return text.encode("cp1252", errors="replace").decode("cp1252")


def _inline(text: str) -> str:
    """Markdown en ligne (gras, italique, code) -> balises reportlab, après échappement."""
    t = escape(_safe(text))
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", t)
    return re.sub(r"`(.+?)`", r"<font face='Courier'>\1</font>", t)


def _slug(title: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "_", _safe(title)).strip("_")[:50] or "rapport"
    return f"{base}_{datetime.now():%Y%m%d_%H%M%S}.pdf"


def markdown_to_story(markdown: str, styles) -> list:
    body = styles["BodyText"]
    cell = ParagraphStyle("cell", parent=body, fontSize=8.5, leading=11)
    story, bullets, table = [], [], []

    def flush_bullets():
        if bullets:
            story.append(ListFlowable([ListItem(Paragraph(_inline(b), body), leftIndent=14) for b in bullets],
                                      bulletType="bullet", start="•", leftIndent=14))
            bullets.clear()

    def flush_table():
        if not table:
            return
        rows = [r for r in table if not all(re.fullmatch(r":?-{2,}:?", c.strip()) for c in r)]
        if rows:
            width = len(max(rows, key=len))
            data = [[Paragraph(_inline(c if i else f"**{c}**"), cell) for c in (r + [""] * (width - len(r)))]
                    for i, r in enumerate(rows)]
            t = Table(data, colWidths=[(A4[0] - 4 * cm) / width] * width, repeatRows=1)
            t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                                   ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF7")),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP")]))
            story.extend([t, Spacer(1, 8)])
        table.clear()

    for raw in markdown.splitlines():
        line = raw.rstrip()
        if line.lstrip().startswith("|"):
            flush_bullets()
            table.append([c.strip() for c in line.strip().strip("|").split("|")])
            continue
        flush_table()
        m = re.match(r"^\s*(?:[-*•]|\d+[.)])\s+(.*)", line)
        if m:
            bullets.append(m.group(1))
            continue
        flush_bullets()
        if not line.strip():
            story.append(Spacer(1, 6))
        elif re.fullmatch(r"\s*(-{3,}|\*{3,})\s*", line):
            story.append(HRFlowable(width="100%", color=colors.lightgrey))
        elif line.startswith("#"):
            level = min(len(line) - len(line.lstrip("#")), 3)
            story.append(Paragraph(_inline(line.lstrip("# ").strip()), styles[f"Heading{level}"]))
        else:
            story.append(Paragraph(_inline(line), body))
    flush_bullets()
    flush_table()
    return story


def write_pdf(directory: str, title: str, markdown: str) -> str:
    Path(directory).mkdir(parents=True, exist_ok=True)
    name = _slug(title)
    styles = getSampleStyleSheet()
    stamp = f"Dokyra AI - généré le {datetime.now():%d/%m/%Y à %H:%M}"

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(2 * cm, 1.2 * cm, _safe(stamp))
        canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"Page {doc.page}")
        canvas.restoreState()

    story = [Paragraph(escape(_safe(title)), styles["Title"]), Spacer(1, 10), *markdown_to_story(markdown, styles)]
    SimpleDocTemplate(str(Path(directory) / name), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                      topMargin=2 * cm, bottomMargin=2 * cm, title=_safe(title), author="Dokyra AI"
                      ).build(story, onFirstPage=footer, onLaterPages=footer)
    return name
