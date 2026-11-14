from __future__ import annotations

import hashlib
import re

from ..domain.entities import ALLOWED_EXTENSIONS, Chunk, Document
from ..domain.errors import DuplicateDocument, EmptyDocument, UnsupportedFormat, ValidationFailed
from ..domain.text import clean_text

EMBED_BATCH = 64


class IngestDocument:
    """Import -> extraction -> nettoyage -> chunking -> embeddings -> stockage."""

    def __init__(self, loader, chunker, embedder, store):
        self.loader, self.chunker, self.embedder, self.store = loader, chunker, embedder, store

    def execute(self, filename: str, data: bytes, title: str, version: str = "1.0") -> Document:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise UnsupportedFormat(f"Formats acceptés : {', '.join(sorted(ALLOWED_EXTENSIONS))}")
        if not data:
            raise EmptyDocument("Le fichier est vide.")
        title = (title or "").strip() or re.sub(r"\.[^.]+$", "", filename)
        version = (version or "").strip() or "1.0"
        if len(title) > 300 or len(version) > 50:
            raise ValidationFailed("Titre (300 caractères max) ou version (50 max) trop long.")

        digest = hashlib.sha256(data).hexdigest()
        existing = self.store.find_by_hash(digest)
        if existing:
            raise DuplicateDocument(existing.id, existing.title)

        raw_pages = self.loader.load(filename, data)  # [(n° page, texte)]
        pages = [(n, clean_text(t)) for n, t in raw_pages]
        pages = [(n, t) for n, t in pages if t]
        if not pages:
            raise EmptyDocument("Aucun texte extractible (PDF scanné ? Il faudrait passer par un OCR).")

        pieces = [(page, piece.strip()) for page, text in pages for piece in self.chunker.split(text)]
        pieces = [(page, piece) for page, piece in pieces if piece]
        # Le titre est ajouté au texte embeddé (pas au texte stocké) : ça aide la recherche quand
        # la question mentionne le nom du document (« dans le règlement intérieur… »).
        texts = [f"{title}\n{piece}" for _, piece in pieces]
        vectors: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH):  # embeddings avant toute écriture en base
            vectors.extend(self.embedder.embed_documents(texts[i:i + EMBED_BATCH]))

        doc = self.store.add_document(Document(
            None, title, version, filename, digest,
            page_count=max(n for n, _ in raw_pages) if raw_pages else 0, chunk_count=len(pieces)))
        try:
            self.store.add_chunks([Chunk(doc.id, page, piece, position=i, embedding=vec)
                                   for i, ((page, piece), vec) in enumerate(zip(pieces, vectors))])
        except Exception:
            self.store.delete_document(doc.id)  # pas de document à moitié importé
            raise
        return doc
