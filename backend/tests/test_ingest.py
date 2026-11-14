import pytest

from app.application.ingest_document import IngestDocument
from app.domain.errors import DuplicateDocument, EmptyDocument, UnsupportedFormat
from tests.fakes import FakeChunker, FakeEmbedder, FakeLoader, FakeStore


def make(pages):
    store, emb = FakeStore(), FakeEmbedder()
    return IngestDocument(FakeLoader(pages), FakeChunker(40), emb, store), store, emb


def test_ingest_chunks_embeds_and_counts():
    uc, store, emb = make([(1, "Le télétravail est autorisé trois jours par semaine."), (3, "Congés payés : 25 jours.")])
    doc = uc.execute("regl.pdf", b"data", " Règlement ", "2024")
    assert doc.title == "Règlement" and doc.page_count == 3 and doc.chunk_count == len(store.chunks) > 2
    assert {c.page for _, c in store.chunks} == {1, 3}
    assert [c.position for _, c in store.chunks] == list(range(doc.chunk_count))
    assert all(t.startswith("Règlement\n") for batch in emb.calls for t in batch)  # titre ajouté à l'embedding
    assert all(not c.content.startswith("Règlement") for _, c in store.chunks)       # mais pas au contenu stocké


def test_rejects_bad_extension_empty_and_duplicates():
    uc, store, _ = make([(1, "texte")])
    with pytest.raises(UnsupportedFormat):
        uc.execute("virus.exe", b"x", "t", "1")
    with pytest.raises(EmptyDocument):
        uc.execute("a.txt", b"", "t", "1")
    uc.execute("a.txt", b"same", "t", "1")
    with pytest.raises(DuplicateDocument) as e:
        uc.execute("b.txt", b"same", "t2", "1")
    assert e.value.existing_id == 1


def test_scanned_pdf_without_text_is_rejected_and_nothing_stored():
    uc, store, _ = make([(1, "  "), (2, "")])
    with pytest.raises(EmptyDocument):
        uc.execute("scan.pdf", b"x", "t", "1")
    assert not store.docs


def test_failed_chunk_insert_rolls_back_document():
    uc, store, _ = make([(1, "du texte à indexer")])
    store.fail_chunks = True
    with pytest.raises(RuntimeError):
        uc.execute("a.txt", b"x", "t", "1")
    assert not store.docs


def test_default_title_from_filename():
    uc, *_ = make([(1, "texte")])
    assert uc.execute("Guide utilisateur.docx", b"x", "", "").title == "Guide utilisateur"
