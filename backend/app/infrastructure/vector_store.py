from __future__ import annotations

import logging
import re

from sqlalchemy import delete, func, literal_column, select, text
from sqlalchemy.orm import sessionmaker

from ..domain.entities import Chunk, Document, Passage
from .database import ChunkModel, DocumentModel

log = logging.getLogger(__name__)

_TOKEN = re.compile(r"[^\W_]{3,}", re.UNICODE)


def _doc(m: DocumentModel) -> Document:
    return Document(m.id, m.title, m.version, m.filename, m.sha256, m.page_count, m.chunk_count, m.created_at)


class PgVectorStore:
    """Documents + chunks dans PostgreSQL : recherche vectorielle (pgvector, HNSW cosinus)
    et recherche plein texte (tsvector français), combinées ensuite par fusion RRF."""

    def __init__(self, session_factory: sessionmaker):
        self.Session = session_factory

    # --- écriture ------------------------------------------------------------------------
    def add_document(self, doc: Document) -> Document:
        with self.Session.begin() as s:
            m = DocumentModel(title=doc.title, version=doc.version, filename=doc.filename, sha256=doc.sha256,
                              page_count=doc.page_count, chunk_count=doc.chunk_count)
            s.add(m)
            s.flush()
            return _doc(m)

    def add_chunks(self, chunks: list[Chunk]) -> None:
        with self.Session.begin() as s:
            s.add_all(ChunkModel(document_id=c.document_id, page=c.page, position=c.position,
                                 content=c.content, embedding=c.embedding) for c in chunks)

    def delete_document(self, document_id: int) -> bool:
        with self.Session.begin() as s:  # les chunks partent avec : ON DELETE CASCADE
            return s.execute(delete(DocumentModel).where(DocumentModel.id == document_id)).rowcount > 0

    # --- lecture -------------------------------------------------------------------------
    def get_document(self, document_id: int) -> Document | None:
        with self.Session() as s:
            m = s.get(DocumentModel, document_id)
            return _doc(m) if m else None

    def find_by_hash(self, sha256: str) -> Document | None:
        with self.Session() as s:
            m = s.scalar(select(DocumentModel).where(DocumentModel.sha256 == sha256))
            return _doc(m) if m else None

    def find_by_title(self, title: str) -> list[Document]:
        pattern = "%" + title.strip().replace("%", r"\%").replace("_", r"\_") + "%"
        with self.Session() as s:
            q = select(DocumentModel).where(DocumentModel.title.ilike(pattern, escape="\\")) \
                .order_by(DocumentModel.created_at, DocumentModel.id)
            return [_doc(m) for m in s.scalars(q)]

    def list_documents(self) -> list[Document]:
        with self.Session() as s:
            return [_doc(m) for m in s.scalars(select(DocumentModel).order_by(DocumentModel.id.desc()))]

    def get_chunks(self, document_id: int, limit: int = 20) -> list[Passage]:
        q = (select(ChunkModel, DocumentModel).join(DocumentModel, DocumentModel.id == ChunkModel.document_id)
             .where(ChunkModel.document_id == document_id)
             .order_by(ChunkModel.page, ChunkModel.position).limit(limit))
        with self.Session() as s:
            return [Passage(d.id, d.title, d.version, c.page, c.content, 0.0, c.id) for c, d in s.execute(q)]

    # --- recherche -----------------------------------------------------------------------
    @staticmethod
    def _iterative_scan(session) -> None:
        """Avec un filtre (document_ids), l'index HNSW filtre APRÈS avoir lu ses ~40 voisins : si le
        document visé est peu représenté, la recherche peut renvoyer trop peu de passages, voire aucun
        (cas typique de la comparaison de deux documents). pgvector >= 0.8 sait poursuivre le balayage."""
        try:
            with session.begin_nested():  # SAVEPOINT : un pgvector plus ancien ne casse pas la requête
                session.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
        except Exception:
            log.warning("hnsw.iterative_scan indisponible (pgvector < 0.8) : "
                        "la recherche filtrée par document peut manquer de résultats")

    def search_vector(self, embedding, k, document_ids=None) -> list[Passage]:
        dist = ChunkModel.embedding.cosine_distance(embedding)
        q = (select(ChunkModel, DocumentModel, dist.label("d"))
             .join(DocumentModel, DocumentModel.id == ChunkModel.document_id)
             .order_by(dist).limit(k))
        if document_ids:
            q = q.where(ChunkModel.document_id.in_(document_ids))
        with self.Session() as s:
            if document_ids:
                self._iterative_scan(s)
            return [Passage(d.id, d.title, d.version, c.page, c.content, 1 - dist_, c.id)
                    for c, d, dist_ in s.execute(q)]

    def search_lexical(self, query, k, document_ids=None) -> list[Passage]:
        terms = list(dict.fromkeys(t.lower() for t in _TOKEN.findall(query)))
        if not terms:
            return []
        # OR entre les mots : une question en langage naturel ne contient jamais tous les mots du passage
        tsq = func.to_tsquery(literal_column("'french'::regconfig"), " | ".join(terms))
        rank = func.ts_rank_cd(ChunkModel.tsv, tsq)
        q = (select(ChunkModel, DocumentModel, rank.label("r"))
             .join(DocumentModel, DocumentModel.id == ChunkModel.document_id)
             .where(ChunkModel.tsv.op("@@")(tsq)).order_by(rank.desc()).limit(k))
        if document_ids:
            q = q.where(ChunkModel.document_id.in_(document_ids))
        with self.Session() as s:
            return [Passage(d.id, d.title, d.version, c.page, c.content, float(r), c.id)
                    for c, d, r in s.execute(q)]
