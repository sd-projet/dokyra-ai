from __future__ import annotations

from dataclasses import asdict
from typing import Iterator

from ..domain.entities import Answer, Conversation, Message, Usage
from ..domain.errors import NotFound, ValidationFailed
from .ask_question import AskQuestion, extract_citations

MAX_QUESTION_CHARS = 4000


class ChatService:
    """Conversations persistées : historique, reformulation des questions de suivi, feedback."""

    def __init__(self, asker: AskQuestion, conversations):
        self.asker, self.conversations = asker, conversations

    # --- utilitaires ---------------------------------------------------------------------
    def _open(self, user_id: int, question: str, conversation_id: str | None) -> tuple[Conversation, list[tuple[str, str]]]:
        question = (question or "").strip()
        if not question:
            raise ValidationFailed("La question est vide.")
        if len(question) > MAX_QUESTION_CHARS:
            raise ValidationFailed(f"Question trop longue ({MAX_QUESTION_CHARS} caractères max).")
        if conversation_id:
            conv = self.conversations.get(conversation_id, user_id)
            if conv is None:
                raise NotFound("Conversation introuvable.")
            history = [(m.role, m.content) for m in self.conversations.messages(conv.id, limit=12)]
        else:
            title = question if len(question) <= 60 else question[:57] + "…"
            conv, history = self.conversations.create(user_id, title), []
        return conv, history

    @staticmethod
    def _usage_dict(usage: Usage | None) -> dict | None:
        return asdict(usage) if usage else None

    # --- cas d'usage ---------------------------------------------------------------------
    def ask(self, user_id: int, question: str, document_ids: list[int] | None = None,
            conversation_id: str | None = None, structured: bool = False) -> tuple[Conversation, Message, Answer]:
        conv, history = self._open(user_id, question, conversation_id)
        answer = self.asker.execute(question.strip(), document_ids, history=history,
                                    user_id=user_id, structured=structured)
        self.conversations.add_message(conv.id, "user", question.strip())
        msg = self.conversations.add_message(conv.id, "assistant", answer.text,
                                             [asdict(p) for p in answer.sources], answer.cited,
                                             self._usage_dict(answer.usage))
        return conv, msg, answer

    def stream(self, user_id: int, question: str, document_ids: list[int] | None = None,
               conversation_id: str | None = None) -> Iterator[tuple[str, object]]:
        """Produit des événements (nom, données) : meta, sources, token, done."""
        conv, history = self._open(user_id, question, conversation_id)
        question = question.strip()
        passages, tokens = self.asker.stream(question, document_ids, history=history, user_id=user_id)
        self.conversations.add_message(conv.id, "user", question)
        sources = [asdict(p) for p in passages]
        yield "meta", {"conversation_id": conv.id, "title": conv.title}
        yield "sources", sources

        text, usage = "", None
        try:
            for t in tokens:
                if isinstance(t, Usage):
                    usage = t
                else:
                    text += t
                    yield "token", t
        finally:  # même si le client coupe la connexion, on garde ce qui a été généré
            cited = extract_citations(text, len(passages))
            msg = self.conversations.add_message(conv.id, "assistant", text, sources, cited,
                                                 self._usage_dict(usage)) if text else None
        yield "done", {"message_id": msg.id if msg else None, "cited": cited, "usage": self._usage_dict(usage)}

    def list_conversations(self, user_id: int) -> list[Conversation]:
        return self.conversations.list(user_id)

    def get_conversation(self, user_id: int, conversation_id: str) -> tuple[Conversation, list[Message]]:
        conv = self.conversations.get(conversation_id, user_id)
        if conv is None:
            raise NotFound("Conversation introuvable.")
        return conv, self.conversations.messages(conv.id)

    def delete_conversation(self, user_id: int, conversation_id: str) -> None:
        if not self.conversations.delete(conversation_id, user_id):
            raise NotFound("Conversation introuvable.")

    def feedback(self, user_id: int, message_id: int, value: int) -> None:
        if value not in (-1, 0, 1):
            raise ValidationFailed("Le feedback doit valoir -1, 0 ou 1.")
        if not self.conversations.set_feedback(message_id, user_id, value):
            raise NotFound("Message introuvable.")
