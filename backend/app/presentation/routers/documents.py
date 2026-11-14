from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ...domain.entities import Principal
from ...domain.errors import ValidationFailed
from ...infrastructure.pdf_report import write_pdf
from ..container import Container
from ..deps import current_principal, get_container, require_admin
from ..schemas import CompareIn, to_dict

router = APIRouter(tags=["documents"])


@router.post("/documents", status_code=201)
def upload(file: UploadFile = File(...), title: str = Form(""), version: str = Form("1.0"),
           _: Principal = Depends(require_admin), c: Container = Depends(get_container)):
    limit = c.settings.max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"Fichier trop volumineux ({c.settings.max_upload_mb} Mo max).")
    return to_dict(c.ingest.execute(file.filename or "", data, title, version))


@router.get("/documents")
def list_documents(_: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    return to_dict(c.documents.list())


@router.get("/documents/{document_id}")
def get_document(document_id: int, _: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    return {**to_dict(c.documents.get(document_id)), "preview": to_dict(c.documents.preview(document_id, 3))}


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: int, _: Principal = Depends(require_admin), c: Container = Depends(get_container)):
    c.documents.delete(document_id)


@router.post("/documents/compare")
def compare(body: CompareIn, p: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    """Comparaison directe (sans agent) de deux documents, ou des 2 dernières versions d'un titre."""
    if body.title:
        result = c.comparer.execute_latest(body.title, body.topic, p.id)
    elif body.document_id_a and body.document_id_b:
        result = c.comparer.execute(body.document_id_a, body.document_id_b, body.topic, p.id)
    else:
        raise ValidationFailed("Indiquez deux document_id, ou un titre.")
    out = {"markdown": result.markdown, "doc_a": to_dict(result.doc_a), "doc_b": to_dict(result.doc_b),
           "usage": to_dict(result.usage), "report": None}
    if body.generate_pdf:  # génération explicitement demandée par l'utilisateur via cette requête
        out["report"] = write_pdf(c.reports_dir, f"Comparaison {result.doc_a.title} v{result.doc_a.version} - "
                                  f"v{result.doc_b.version}", result.markdown)
    return out


@router.get("/reports")
def list_reports(_: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    d = Path(c.reports_dir)
    files = sorted(d.glob("*.pdf"), key=lambda f: f.stat().st_mtime, reverse=True) if d.exists() else []
    return [{"name": f.name, "size": f.stat().st_size, "modified": f.stat().st_mtime} for f in files]


@router.get("/reports/{name}")
def download_report(name: str, _: Principal = Depends(current_principal), c: Container = Depends(get_container)):
    path = Path(c.reports_dir) / Path(name).name  # anti path-traversal
    if not path.is_file() or path.suffix != ".pdf":
        raise HTTPException(404, "Rapport introuvable.")
    return FileResponse(path, media_type="application/pdf", filename=path.name)
