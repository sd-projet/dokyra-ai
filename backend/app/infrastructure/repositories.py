from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import sessionmaker

from ..domain.entities import Conversation, Message, Usage, User
from .database import ConversationModel, MessageModel, UsageModel, UserModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SqlUserRepository:
    def __init__(self, sf: sessionmaker):
        self.Session = sf

    @staticmethod
    def _to(m: UserModel) -> User:
        return User(m.id, m.username, m.password_hash, m.role, m.created_at)

    def add(self, user: User) -> User:
        with self.Session.begin() as s:
            m = UserModel(username=user.username, password_hash=user.password_hash, role=user.role)
            s.add(m)
            s.flush()
            return self._to(m)

    def get(self, user_id: int) -> User | None:
        with self.Session() as s:
            m = s.get(UserModel, user_id)
            return self._to(m) if m else None

    def get_by_username(self, username: str) -> User | None:
        with self.Session() as s:
            m = s.scalar(select(UserModel).where(UserModel.username == username))
            return self._to(m) if m else None

    def delete(self, user_id: int) -> bool:
        """Supprime le compte ; ses conversations partent avec lui (ON DELETE CASCADE)."""
        with self.Session.begin() as s:
            m = s.get(UserModel, user_id)
            if not m:
                return False
            s.delete(m)
            return True

    def list(self) -> list[User]:
        with self.Session() as s:
            return [self._to(m) for m in s.scalars(select(UserModel).order_by(UserModel.id))]

    def count(self) -> int:
        with self.Session() as s:
            return s.scalar(select(func.count()).select_from(UserModel)) or 0


class SqlConversationRepository:
    def __init__(self, sf: sessionmaker):
        self.Session = sf

    @staticmethod
    def _conv(m: ConversationModel) -> Conversation:
        return Conversation(m.id, m.user_id, m.title, m.created_at, m.updated_at)

    @staticmethod
    def _msg(m: MessageModel) -> Message:
        return Message(m.id, m.conversation_id, m.role, m.content, m.sources or [], m.cited or [],
                       m.usage, m.feedback, m.created_at)

    def create(self, user_id: int, title: str) -> Conversation:
        with self.Session.begin() as s:
            m = ConversationModel(user_id=user_id, title=title)
            s.add(m)
            s.flush()
            return self._conv(m)

    def get(self, conversation_id: str, user_id: int) -> Conversation | None:
        with self.Session() as s:
            m = s.scalar(select(ConversationModel).where(ConversationModel.id == conversation_id,
                                                         ConversationModel.user_id == user_id))
            return self._conv(m) if m else None

    def list(self, user_id: int) -> list[Conversation]:
        with self.Session() as s:
            q = select(ConversationModel).where(ConversationModel.user_id == user_id) \
                .order_by(ConversationModel.updated_at.desc()).limit(100)
            return [self._conv(m) for m in s.scalars(q)]

    def delete(self, conversation_id: str, user_id: int) -> bool:
        with self.Session.begin() as s:
            return s.execute(delete(ConversationModel).where(
                ConversationModel.id == conversation_id, ConversationModel.user_id == user_id)).rowcount > 0

    def add_message(self, conversation_id, role, content, sources=None, cited=None, usage=None) -> Message:
        with self.Session.begin() as s:
            m = MessageModel(conversation_id=conversation_id, role=role, content=content,
                             sources=sources or [], cited=cited or [], usage=usage)
            s.add(m)
            s.execute(update(ConversationModel).where(ConversationModel.id == conversation_id)
                      .values(updated_at=_now()))
            s.flush()
            return self._msg(m)

    def messages(self, conversation_id: str, limit: int | None = None) -> list[Message]:
        with self.Session() as s:
            if limit:  # les `limit` derniers messages, remis dans l'ordre chronologique
                q = select(MessageModel).where(MessageModel.conversation_id == conversation_id) \
                    .order_by(MessageModel.id.desc()).limit(limit)
                return [self._msg(m) for m in reversed(list(s.scalars(q)))]
            q = select(MessageModel).where(MessageModel.conversation_id == conversation_id) \
                .order_by(MessageModel.id)
            return [self._msg(m) for m in s.scalars(q)]

    def set_feedback(self, message_id: int, user_id: int, value: int) -> bool:
        with self.Session.begin() as s:
            m = s.scalar(select(MessageModel).join(ConversationModel,
                         ConversationModel.id == MessageModel.conversation_id)
                         .where(MessageModel.id == message_id, ConversationModel.user_id == user_id))
            if m is None:
                return False
            m.feedback = value or None
            return True


class SqlUsageRepository:
    def __init__(self, sf: sessionmaker):
        self.Session = sf

    def add(self, user_id: int | None, operation: str, usage: Usage) -> None:
        with self.Session.begin() as s:
            s.add(UsageModel(user_id=user_id, operation=operation, model=usage.model or "?",
                             prompt_tokens=usage.prompt_tokens, completion_tokens=usage.completion_tokens,
                             cost_usd=usage.cost_usd, latency_ms=usage.latency_ms))

    def summary(self, user_id: int | None, days: int) -> dict:
        since = _now() - timedelta(days=days)
        cond = [UsageModel.created_at >= since] + ([UsageModel.user_id == user_id] if user_id else [])
        cols = (func.count().label("calls"), func.coalesce(func.sum(UsageModel.prompt_tokens), 0),
                func.coalesce(func.sum(UsageModel.completion_tokens), 0),
                func.coalesce(func.sum(UsageModel.cost_usd), 0.0),
                func.coalesce(func.avg(UsageModel.latency_ms), 0.0))

        def row(r, *keys):
            vals = list(r)
            return {**dict(zip(keys, vals[:len(keys)])),
                    "calls": vals[len(keys)], "prompt_tokens": int(vals[len(keys) + 1]),
                    "completion_tokens": int(vals[len(keys) + 2]), "cost_usd": round(float(vals[len(keys) + 3]), 6),
                    "avg_latency_ms": int(vals[len(keys) + 4])}

        with self.Session() as s:
            total = row(s.execute(select(*cols).where(*cond)).one())
            by_model = [row(r, "model") for r in s.execute(
                select(UsageModel.model, *cols).where(*cond).group_by(UsageModel.model)
                .order_by(func.sum(UsageModel.cost_usd).desc()))]
            by_op = [row(r, "operation") for r in s.execute(
                select(UsageModel.operation, *cols).where(*cond).group_by(UsageModel.operation)
                .order_by(func.count().desc()))]
            day = func.date(UsageModel.created_at)
            by_day = [row(r, "day") for r in s.execute(
                select(day, *cols).where(*cond).group_by(day).order_by(day))]
        for r in by_day:
            r["day"] = str(r["day"])
        return {"days": days, "total": total, "by_model": by_model, "by_operation": by_op, "by_day": by_day}