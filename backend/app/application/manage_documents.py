from __future__ import annotations

from ..domain.entities import Document, Passage
from ..domain.errors import NotFound


class ManageDocuments:
    def __init__(self, store):
        self.store = store

    def list(self) -> list[Document]:
        return self.store.list_documents()

    def get(self, document_id: int) -> Document:
        doc = self.store.get_document(document_id)
        if doc is None:
            raise NotFound("Document introuvable.")
        return doc

    def preview(self, document_id: int, limit: int = 5) -> list[Passage]:
        self.get(document_id)
        return self.store.get_chunks(document_id, limit)

    def delete(self, document_id: int) -> None:
        if not self.store.delete_document(document_id):
            raise NotFound("Document introuvable.")
