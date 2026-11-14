import pytest

from app.application.ask_question import AskQuestion
from app.application.usage import UsageTracker
from tests.fakes import FakeEmbedder, FakeLLM, FakeStore, FakeUsageRepo, IdentityReranker


def seed(store, embedder, title, version, text, page=1):
    from app.domain.entities import Chunk, Document
    doc = store.add_document(Document(None, title, version, f"{title}.txt", sha256=f"{title}{version}"))
    store.add_chunks([Chunk(doc.id, page, text, 0, embedder.embed_query(text))])
    return doc


@pytest.fixture
def env():
    store, emb, repo = FakeStore(), FakeEmbedder(), FakeUsageRepo()
    tracker = UsageTracker(repo, {"fake-model": (1.0, 2.0)})

    def make(*responses):
        llm = FakeLLM(*responses)
        return llm, AskQuestion(emb, store, IdentityReranker(), llm, tracker)

    return dict(store=store, emb=emb, repo=repo, tracker=tracker, make=make, seed=lambda *a, **k: seed(store, emb, *a, **k))
