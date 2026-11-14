import io

from docx import Document as Docx
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader

from ..domain.errors import EmptyDocument, UnsupportedFormat


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1", errors="ignore")


def _load_pdf(data: bytes) -> list[tuple[int, str]]:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise EmptyDocument("PDF protégé par mot de passe.")
        return [(i + 1, p.extract_text() or "") for i, p in enumerate(reader.pages)]
    except EmptyDocument:
        raise
    except Exception as e:
        raise EmptyDocument(f"PDF illisible : {e}")


def _load_docx(data: bytes) -> list[tuple[int, str]]:
    """Un DOCX n'a pas de pages fixes : on repère les sauts de page (explicites ou calculés par
    Word au dernier enregistrement) pour approcher la numérotation réelle. Les tableaux sont inclus."""
    try:
        doc = Docx(io.BytesIO(data))
    except Exception as e:
        raise EmptyDocument(f"DOCX illisible : {e}")
    pages: dict[int, list[str]] = {1: []}
    page = 1
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            para = Paragraph(child, doc)
            xml = child.xml
            if "lastRenderedPageBreak" in xml or 'w:type="page"' in xml:
                page += 1
                pages.setdefault(page, [])
            if para.text.strip():
                pages[page].append(para.text)
        elif tag == "tbl":
            for row in Table(child, doc).rows:
                cells = []
                for cell in row.cells:
                    t = cell.text.strip().replace("\n", " ")
                    if t and (not cells or cells[-1] != t):  # cellules fusionnées = doublons
                        cells.append(t)
                if cells:
                    pages[page].append(" | ".join(cells))
    return [(n, "\n".join(lines)) for n, lines in sorted(pages.items())]


class FileLoader:
    """Retourne une liste de (numéro de page, texte)."""

    def load(self, filename: str, data: bytes) -> list[tuple[int, str]]:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext == "pdf":
            return _load_pdf(data)
        if ext == "docx":
            return _load_docx(data)
        if ext in ("txt", "md"):
            return [(1, _decode(data))]
        raise UnsupportedFormat(f"Format non supporté : {ext}")
