"""Entités et règles métier. Aucune dépendance technique (ni FastAPI, ni SQL, ni LLM)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md"}  # règle métier : formats importables
ROLE_ADMIN = "admin"
ROLE_USER = "user"
ROLES = {ROLE_ADMIN, ROLE_USER}


@dataclass
class Document:
    id: int | None
    title: str
    version: str
    filename: str
    sha256: str = ""
    page_count: int = 0
    chunk_count: int = 0
    created_at: datetime | None = None


@dataclass
class Chunk:
    document_id: int
    page: int
    content: str
    position: int = 0
    embedding: list[float] | None = None


@dataclass
class Passage:
    document_id: int
    title: str
    version: str
    page: int
    content: str
    score: float = 0.0
    chunk_id: int | None = None


@dataclass
class Usage:
    """Consommation d'un appel LLM (tokens, latence, coût estimé)."""
    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0
    cost_usd: float = 0.0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass
class LLMResult:
    text: str
    usage: Usage


@dataclass
class Answer:
    text: str
    sources: list[Passage]
    cited: list[int] = field(default_factory=list)  # numéros [n] (base 1) réellement cités
    key_points: list[str] = field(default_factory=list)
    confidence: str | None = None  # high | medium | low (mode JSON)
    found: bool = True  # False si les documents ne contiennent pas la réponse
    standalone_question: str | None = None  # question reformulée (suivi de conversation)
    usage: Usage | None = None


@dataclass
class User:
    id: int | None
    username: str
    password_hash: str
    role: str = ROLE_USER
    created_at: datetime | None = None


@dataclass
class Principal:
    """Identité extraite du jeton : suffisante pour autoriser une requête."""
    id: int
    username: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN


@dataclass
class Conversation:
    id: str
    user_id: int
    title: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class Message:
    id: int | None
    conversation_id: str
    role: str  # user | assistant
    content: str
    sources: list[dict] = field(default_factory=list)
    cited: list[int] = field(default_factory=list)
    usage: dict | None = None
    feedback: int | None = None  # 1 = utile, -1 = pas utile
    created_at: datetime | None = None


@dataclass
class Comparison:
    markdown: str
    doc_a: Document
    doc_b: Document
    usage: Usage | None = None


@dataclass
class ModelRun:
    model: str
    text: str = ""
    error: str | None = None
    usage: Usage | None = None
