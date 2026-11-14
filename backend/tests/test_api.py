"""Tests de l'API avec des doublures en mémoire. Ignorés si FastAPI / httpx ne sont pas installés
(pip install -r requirements-dev.txt)."""
from types import SimpleNamespace

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

from app.application.auth_service import AuthService  # noqa: E402
from app.application.chat_service import ChatService  # noqa: E402
from app.application.compare_documents import CompareDocuments  # noqa: E402
from app.application.compare_models import CompareModels  # noqa: E402
from app.application.ingest_document import IngestDocument  # noqa: E402
from app.application.manage_documents import ManageDocuments  # noqa: E402
from app.infrastructure.security import PasswordHasher, TokenService  # noqa: E402
from app.presentation.container import Container  # noqa: E402
from app.presentation.main import create_app  # noqa: E402
from tests.fakes import FakeChunker, FakeConversations, FakeLoader, FakeUserRepo  # noqa: E402


@pytest.fixture
def client(env, tmp_path):
    llm, ask = env["make"]("Trois jours [1].")
    auth = AuthService(FakeUserRepo(), PasswordHasher(), TokenService("s" * 32))
    auth.ensure_admin("admin", "admin-pass-1")
    auth.create_user("alice", "alice-pass-1", "user")
    settings = SimpleNamespace(origins=["http://localhost:4200"], max_upload_mb=1, models=["fake-model"],
                               llm_model="fake-model")
    container = Container(
        settings=settings, auth=auth, documents=ManageDocuments(env["store"]),
        ingest=IngestDocument(FakeLoader([(1, "Le télétravail est autorisé trois jours.")]), FakeChunker(),
                              env["emb"], env["store"]),
        chat=ChatService(ask, FakeConversations()), comparer=CompareDocuments(ask, llm, env["store"], env["tracker"]),
        model_compare=CompareModels(ask, llm, env["tracker"], ["fake-model"]), usage=env["tracker"],
        agent=None, reports_dir=str(tmp_path), health=lambda: {"status": "ok"})
    return TestClient(create_app(container))


def login(client, user, pw):
    r = client.post("/auth/login", json={"username": user, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_auth_required_and_bad_login(client):
    assert client.get("/documents").status_code == 401
    assert client.post("/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401
    assert client.get("/health").json() == {"status": "ok"}


def test_upload_ask_and_permissions(client):
    admin, alice = login(client, "admin", "admin-pass-1"), login(client, "alice", "alice-pass-1")
    files = {"file": ("regl.txt", b"contenu", "text/plain")}
    r = client.post("/documents", files=files, data={"title": "Règlement", "version": "2024"}, headers=admin)
    assert r.status_code == 201 and r.json()["title"] == "Règlement" and "embedding" not in r.json()
    assert client.post("/documents", files=files, data={"title": "x"}, headers=admin).status_code == 409  # doublon
    assert client.post("/documents", files={"file": ("b.txt", b"autre", "text/plain")}, headers=alice).status_code == 403

    r = client.post("/chat/ask", json={"question": "télétravail ?"}, headers=alice)
    body = r.json()
    assert r.status_code == 200 and body["cited"] == [1] and body["sources"][0]["title"] == "Règlement"
    r2 = client.post("/chat/ask", json={"question": "et ensuite ?", "conversation_id": body["conversation_id"]}, headers=admin)
    assert r2.status_code == 404  # conversation d'un autre utilisateur


def test_stream_returns_sse_events(client):
    admin = login(client, "admin", "admin-pass-1")
    client.post("/documents", files={"file": ("a.txt", b"c", "text/plain")}, data={"title": "R"}, headers=admin)
    r = client.post("/chat/stream", json={"question": "télétravail ?"}, headers=admin)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    for event in ("event: meta", "event: sources", "event: token", "event: done"):
        assert event in r.text
