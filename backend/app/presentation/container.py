"""Composition root : seul endroit qui connaît les implémentations concrètes."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

from ..application.ask_question import AskQuestion
from ..application.auth_service import AuthService
from ..application.chat_service import ChatService
from ..application.compare_documents import CompareDocuments
from ..application.compare_models import CompareModels
from ..application.ingest_document import IngestDocument
from ..application.manage_documents import ManageDocuments
from ..application.usage import UsageTracker

log = logging.getLogger(__name__)


@dataclass
class Container:
    settings: object
    auth: AuthService
    documents: ManageDocuments
    ingest: IngestDocument
    chat: ChatService
    comparer: CompareDocuments
    model_compare: CompareModels
    usage: UsageTracker
    agent: object  # AgentRunner
    reports_dir: str
    health: Callable[[], dict]


def build_container(s) -> Container:
    # imports locaux : les bibliothèques lourdes (torch, langchain…) ne sont chargées qu'ici
    from ..infrastructure.agent import AgentRunner, build_agent
    from ..infrastructure.chunker import Chunker
    from ..infrastructure.database import create_session_factory
    from ..infrastructure.embeddings import HFEmbedder
    from ..infrastructure.llm import OpenAILLM
    from ..infrastructure.loaders import FileLoader
    from ..infrastructure.reranker import CrossEncoderReranker, NoReranker
    from ..infrastructure.repositories import SqlConversationRepository, SqlUsageRepository, SqlUserRepository
    from ..infrastructure.security import PasswordHasher, TokenService
    from ..infrastructure.vector_store import PgVectorStore

    for warning in s.assert_secure():
        log.warning("Sécurité : %s — à corriger avant la mise en production", warning)

    sf = create_session_factory(s.database_url)
    store = PgVectorStore(sf)
    embedder = HFEmbedder(s.embedding_model)
    reranker = NoReranker()
    if s.use_reranker:
        try:
            reranker = CrossEncoderReranker(s.reranker_model)
        except Exception:
            log.exception("Reranker indisponible : repli sur l'ordre de la recherche hybride")
    llm = OpenAILLM(s.llm_model, s.openai_api_key, s.openai_base_url, timeout=s.llm_timeout)

    tracker = UsageTracker(SqlUsageRepository(sf), {k: tuple(v) for k, v in s.model_prices.items()})
    asker = AskQuestion(embedder, store, reranker, llm, tracker, k=s.retrieval_k, top_n=s.retrieval_top_n)
    comparer = CompareDocuments(asker, llm, store, tracker)
    auth = AuthService(SqlUserRepository(sf), PasswordHasher(), TokenService(s.jwt_secret, s.jwt_hours))
    auth.ensure_admin(s.admin_user, s.admin_password)

    def health() -> dict:
        from sqlalchemy import text
        with sf() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok", "llm_model": s.llm_model, "reranker": type(reranker).__name__}

    return Container(
        settings=s, auth=auth, documents=ManageDocuments(store),
        ingest=IngestDocument(FileLoader(), Chunker(s.chunk_size, s.chunk_overlap), embedder, store),
        chat=ChatService(asker, SqlConversationRepository(sf)), comparer=comparer,
        model_compare=CompareModels(asker, llm, tracker, s.models), usage=tracker,
        agent=AgentRunner(build_agent(llm.chat, asker, comparer, store, s.reports_dir, llm, tracker), tracker),
        reports_dir=s.reports_dir, health=health)
