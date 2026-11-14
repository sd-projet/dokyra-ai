"""Doublures en mémoire des ports : permettent de tester application + domaine sans base ni LLM."""
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from itertools import count

from app.domain.entities import Conversation, Document, LLMResult, Message, Passage, Usage, User
from app.domain.ranking import reciprocal_rank_fusion


class FakeEmbedder:
    def __init__(self):
        self.calls = []

    @staticmethod
    def _vec(text):
        t = text.lower()
        return [float("télétravail" in t), float("congé" in t), float("salaire" in t)]

    def embed_documents(self, texts):
        self.calls.append(list(texts))
        return [self._vec(t) for t in texts]

    def embed_query(self, text):
        return self._vec(text)


class FakeChunker:
    def __init__(self, size=60):
        self.size = size

    def split(self, text):
        return [text[i:i + self.size] for i in range(0, len(text), self.size)]


class FakeLoader:
    def __init__(self, pages):
        self.pages = pages

    def load(self, filename, data):
        return self.pages


class FakeStore:
    def __init__(self):
        self.docs, self.chunks, self._ids, self._cid = {}, [], count(1), count(1)
        self.fail_chunks = False

    def add_document(self, doc):
        doc = replace(doc, id=next(self._ids), created_at=datetime.now(timezone.utc) + timedelta(seconds=len(self.docs)))
        self.docs[doc.id] = doc
        return doc

    def add_chunks(self, chunks):
        if self.fail_chunks:
            raise RuntimeError("boom")
        for c in chunks:
            self.chunks.append((next(self._cid), c))

    def delete_document(self, document_id):
        existed = self.docs.pop(document_id, None) is not None
        self.chunks = [(i, c) for i, c in self.chunks if c.document_id != document_id]
        return existed

    def get_document(self, document_id):
        return self.docs.get(document_id)

    def find_by_hash(self, sha):
        return next((d for d in self.docs.values() if d.sha256 == sha), None)

    def find_by_title(self, title):
        return sorted((d for d in self.docs.values() if title.lower() in d.title.lower()), key=lambda d: d.id)

    def list_documents(self):
        return list(self.docs.values())

    def _passages(self, document_ids):
        for cid, c in self.chunks:
            if document_ids and c.document_id not in document_ids:
                continue
            d = self.docs[c.document_id]
            yield cid, c, d

    def get_chunks(self, document_id, limit=20):
        return [Passage(d.id, d.title, d.version, c.page, c.content, 0.0, cid)
                for cid, c, d in self._passages([document_id])][:limit]

    def search_vector(self, embedding, k, document_ids=None):
        out = []
        for cid, c, d in self._passages(document_ids):
            score = sum(a * b for a, b in zip(embedding, c.embedding))
            if score > 0:
                out.append(Passage(d.id, d.title, d.version, c.page, c.content, score, cid))
        return sorted(out, key=lambda p: p.score, reverse=True)[:k]

    def search_lexical(self, query, k, document_ids=None):
        words = {w for w in query.lower().split() if len(w) > 3}
        out = [Passage(d.id, d.title, d.version, c.page, c.content, 1.0, cid)
               for cid, c, d in self._passages(document_ids) if words & set(c.content.lower().split())]
        return out[:k]


class IdentityReranker:
    def rerank(self, query, passages, top_n):
        return passages[:top_n]


class FakeLLM:
    """Renvoie des réponses préparées à l'avance et mémorise les appels."""

    def __init__(self, *responses, model="fake-model"):
        self.responses, self.calls, self.model = list(responses), [], model

    def _next(self):
        return self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]

    def complete(self, system, user, *, history=None, model=None, json_mode=False):
        self.calls.append(dict(system=system, user=user, history=history, model=model, json_mode=json_mode))
        text = self._next()
        if isinstance(text, Exception):
            raise text
        return LLMResult(text, Usage(model or self.model, 100, 20, 5))

    def stream(self, system, user, *, history=None, model=None):
        self.calls.append(dict(system=system, user=user, history=history, model=model))
        for part in self._next().split("|"):
            yield part
        yield Usage(model or self.model, 80, 10, 5)


class FakeUsageRepo:
    def __init__(self):
        self.rows = []

    def add(self, user_id, operation, usage):
        self.rows.append((user_id, operation, usage))


class FakeUserRepo:
    def __init__(self):
        self.users, self._ids = {}, count(1)

    def add(self, user):
        user = replace(user, id=next(self._ids))
        self.users[user.username] = user
        return user

    def get(self, user_id):
        return next((u for u in self.users.values() if u.id == user_id), None)

    def get_by_username(self, username):
        return self.users.get(username)

    def delete(self, user_id):
        u = self.get(user_id)
        if u:
            del self.users[u.username]
        return u is not None

    def list(self):
        return list(self.users.values())

    def count(self):
        return len(self.users)


class FakeConversations:
    def __init__(self):
        self.convs, self.msgs, self._mid = {}, {}, count(1)

    def create(self, user_id, title):
        conv = Conversation(f"c{len(self.convs) + 1}", user_id, title)
        self.convs[conv.id] = conv
        self.msgs[conv.id] = []
        return conv

    def get(self, conversation_id, user_id):
        c = self.convs.get(conversation_id)
        return c if c and c.user_id == user_id else None

    def list(self, user_id):
        return [c for c in self.convs.values() if c.user_id == user_id]

    def delete(self, conversation_id, user_id):
        if not self.get(conversation_id, user_id):
            return False
        del self.convs[conversation_id], self.msgs[conversation_id]
        return True

    def add_message(self, conversation_id, role, content, sources=None, cited=None, usage=None):
        m = Message(next(self._mid), conversation_id, role, content, sources or [], cited or [], usage)
        self.msgs[conversation_id].append(m)
        return m

    def messages(self, conversation_id, limit=None):
        ms = self.msgs[conversation_id]
        return ms[-limit:] if limit else list(ms)

    def set_feedback(self, message_id, user_id, value):
        for cid, ms in self.msgs.items():
            for m in ms:
                if m.id == message_id and self.convs[cid].user_id == user_id:
                    m.feedback = value or None
                    return True
        return False