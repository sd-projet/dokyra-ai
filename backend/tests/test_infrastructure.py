import io

import pytest
from docx import Document as Docx
from docx.enum.text import WD_BREAK
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from app.domain.errors import EmptyDocument, UnsupportedFormat
from app.infrastructure.loaders import FileLoader
from app.infrastructure.pdf_report import write_pdf


def make_pdf(pages):
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for text in pages:
        c.drawString(72, 750, text)
        c.showPage()
    c.save()
    return buf.getvalue()


def test_pdf_pages_are_numbered():
    pages = FileLoader().load("a.pdf", make_pdf(["Page un", "Page deux", "Page trois"]))
    assert [(n, t.strip()) for n, t in pages] == [(1, "Page un"), (2, "Page deux"), (3, "Page trois")]


def test_corrupt_pdf_gives_domain_error():
    with pytest.raises(EmptyDocument):
        FileLoader().load("a.pdf", b"not a pdf")


def test_docx_text_tables_and_page_breaks():
    d = Docx()
    d.add_paragraph("Introduction du règlement")
    t = d.add_table(rows=2, cols=2)
    for i, v in enumerate(["Jours", "Condition", "3", "6 mois d'ancienneté"]):
        t.cell(i // 2, i % 2).text = v
    d.add_paragraph("").add_run().add_break(WD_BREAK.PAGE)
    d.add_paragraph("Article télétravail")
    buf = io.BytesIO()
    d.save(buf)
    pages = dict(FileLoader().load("r.docx", buf.getvalue()))
    assert "Introduction du règlement" in pages[1] and "Jours | Condition" in pages[1] and "3 | 6 mois d'ancienneté" in pages[1]
    assert "Article télétravail" in pages[2]


def test_txt_decoding_and_unsupported():
    assert FileLoader().load("a.txt", "télétravail".encode("cp1252")) == [(1, "télétravail")]
    assert FileLoader().load("a.md", "# Titre".encode()) == [(1, "# Titre")]
    with pytest.raises(UnsupportedFormat):
        FileLoader().load("a.exe", b"x")


def test_pdf_report_renders_markdown_tables_and_special_chars(tmp_path):
    md = ("# Rapport\n## Résumé\nTexte avec **gras**, *italique* & <balise> → flèche ≥ 3.\n\n"
          "| Critère | A | B |\n|---|---|---|\n| Jours | 1 | 3 |\n| Ancienneté | 12 mois | 6 mois |\n\n"
          "- point un\n- point deux\n1. numéro\n\n---\nFin")
    name = write_pdf(str(tmp_path), "Comparaison télétravail / 2023 vs 2025", md)
    assert name.endswith(".pdf") and "/" not in name
    text = "".join(p.extract_text() for p in PdfReader(str(tmp_path / name)).pages)
    for expected in ["Comparaison télétravail", "Résumé", "gras", "<balise>", "Ancienneté", "12 mois", "point deux", "Page 1"]:
        assert expected in text, expected


def test_database_url_is_normalised_for_psycopg():
    pytest.importorskip("pydantic_settings")
    from app.infrastructure.config import Settings
    assert Settings(database_url="postgresql://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    assert Settings(database_url="postgres://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    assert Settings(database_url="postgresql+psycopg://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"