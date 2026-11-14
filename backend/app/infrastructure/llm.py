from __future__ import annotations

import time
from typing import Iterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from ..domain.entities import LLMResult, Usage
from ..domain.errors import LLMError


def _text(content) -> str:
    """Le contenu d'un message est une str, ou une liste de blocs chez certains fournisseurs."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(b if isinstance(b, str) else b.get("text", "") for b in content)
    return str(content or "")


class OpenAILLM:
    """Adaptateur LangChain. Changer de fournisseur = changer base_url / modèle (.env)."""

    def __init__(self, model: str, api_key: str, base_url: str | None = None,
                 temperature: float = 0.0, timeout: int = 60):
        self.default_model = model
        self._kw = dict(api_key=api_key or "missing", base_url=base_url or None,
                        temperature=temperature, timeout=timeout, max_retries=2)
        self._chats: dict[str, ChatOpenAI] = {}

    def chat_for(self, model: str | None = None) -> ChatOpenAI:
        name = model or self.default_model
        if name not in self._chats:
            self._chats[name] = ChatOpenAI(model=name, stream_usage=True, **self._kw)
        return self._chats[name]

    @property
    def chat(self) -> ChatOpenAI:  # utilisé par l'agent LangGraph
        return self.chat_for()

    @staticmethod
    def _messages(system, user, history):
        msgs = [SystemMessage(system)]
        for role, content in history or []:
            msgs.append(HumanMessage(content) if role == "user" else AIMessage(content))
        return [*msgs, HumanMessage(user)]

    @staticmethod
    def _usage(model, msgs, text, meta, started) -> Usage:
        meta = meta or {}
        prompt = meta.get("input_tokens") or sum(len(_text(m.content)) for m in msgs) // 4  # estimation
        completion = meta.get("output_tokens") or len(text) // 4
        return Usage(model, int(prompt), int(completion), int((time.perf_counter() - started) * 1000))

    def complete(self, system, user, *, history=None, model=None, json_mode=False) -> LLMResult:
        chat, msgs, started = self.chat_for(model), self._messages(system, user, history), time.perf_counter()
        try:
            try:
                res = (chat.bind(response_format={"type": "json_object"}) if json_mode else chat).invoke(msgs)
            except Exception as e:
                # certains fournisseurs ne gèrent pas response_format : on retente en mode texte
                from openai import BadRequestError
                if not (json_mode and isinstance(e, BadRequestError)):
                    raise
                res = chat.invoke(msgs)
        except Exception as e:
            raise LLMError(f"Appel au modèle « {model or self.default_model} » impossible : {e}") from e
        text = _text(res.content)
        used = (res.response_metadata or {}).get("model_name") or model or self.default_model
        return LLMResult(text, self._usage(used, msgs, text, res.usage_metadata, started))

    def stream(self, system, user, *, history=None, model=None) -> Iterator[str | Usage]:
        chat, msgs, started = self.chat_for(model), self._messages(system, user, history), time.perf_counter()
        text, meta = "", None
        try:
            for chunk in chat.stream(msgs):
                if chunk.usage_metadata:
                    meta = chunk.usage_metadata
                piece = _text(chunk.content)
                if piece:
                    text += piece
                    yield piece
        except Exception as e:
            raise LLMError(f"Streaming impossible : {e}") from e
        yield self._usage(model or self.default_model, msgs, text, meta, started)
