from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Literal

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class UserIn(BaseModel):
    username: str
    password: str
    role: Literal["admin", "user"] = "user"


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    document_ids: list[int] | None = None
    conversation_id: str | None = None
    structured: bool = False  # True : réponse JSON structurée (points clés, confiance)


class FeedbackIn(BaseModel):
    value: Literal[-1, 0, 1]


class CompareIn(BaseModel):
    topic: str = Field(min_length=1, max_length=500)
    document_id_a: int | None = None  # ancien
    document_id_b: int | None = None  # récent
    title: str | None = None  # alternative : comparer les 2 versions les plus récentes de ce titre
    generate_pdf: bool = False


class CompareModelsIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    models: list[str] = Field(min_length=1, max_length=4)
    document_ids: list[int] | None = None


class AgentIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    thread_id: str = Field(min_length=1, max_length=64, pattern=r"^[\w.-]+$")


class ResumeIn(BaseModel):
    thread_id: str = Field(min_length=1, max_length=64, pattern=r"^[\w.-]+$")
    approved: bool


def to_dict(obj):
    """Dataclass (ou liste de dataclasses) -> dict sérialisable ; masque les champs sensibles."""
    if isinstance(obj, list):
        return [to_dict(o) for o in obj]
    if is_dataclass(obj):
        d = asdict(obj)
        d.pop("password_hash", None)
        d.pop("embedding", None)
        return d
    return obj
