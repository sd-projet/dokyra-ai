import pytest

from app.application.chat_service import ChatService
from app.domain.entities import Usage
from app.domain.errors import NotFound, ValidationFailed
from tests.fakes import FakeConversations


def svc(env, *responses):
    env["seed"]("Règlement", "2024", "Le télétravail est autorisé 3 jours.")
    llm, ask = env["make"](*responses)
    return ChatService(ask, FakeConversations()), llm


def test_ask_creates_conversation_and_persists_both_messages(env):
    s, _ = svc(env, "Oui [1]")
    conv, msg, a = s.ask(1, "Le télétravail ?")
    _, messages = s.get_conversation(1, conv.id)
    assert [m.role for m in messages] == ["user", "assistant"]
    assert messages[1].cited == [1] and messages[1].sources[0]["page"] == 1 and messages[1].usage["prompt_tokens"] == 100


def test_follow_up_uses_history_and_conversations_are_private(env):
    s, llm = svc(env, "Oui [1]", "Le télétravail ?", "Encore [1]")
    conv, *_ = s.ask(1, "Le télétravail ?")
    _, _, a = s.ask(1, "Et combien de jours ?", conversation_id=conv.id)
    assert a.standalone_question == "Le télétravail ?"
    with pytest.raises(NotFound):
        s.ask(2, "intrus", conversation_id=conv.id)
    with pytest.raises(NotFound):
        s.get_conversation(2, conv.id)
    with pytest.raises(NotFound):
        s.delete_conversation(2, conv.id)


def test_stream_events_and_persistence(env):
    s, _ = svc(env, "Bon|jour [1]")
    events = list(s.stream(1, "Le télétravail ?"))
    names = [n for n, _ in events]
    assert names[:2] == ["meta", "sources"] and names[-1] == "done" and names.count("token") == 2
    done = events[-1][1]
    conv_id = events[0][1]["conversation_id"]
    _, messages = s.get_conversation(1, conv_id)
    assert messages[1].content == "Bonjour [1]" and done["cited"] == [1] and done["message_id"] == messages[1].id


def test_stream_keeps_partial_answer_when_client_disconnects(env):
    s, _ = svc(env, "Bon|jour|encore")
    gen = s.stream(1, "Le télétravail ?")
    next(gen), next(gen), next(gen)  # meta, sources, 1er token
    gen.close()                       # le client coupe
    (conv,) = s.conversations.convs.values()
    assert s.conversations.messages(conv.id)[-1].content == "Bon"


def test_validation_and_feedback(env):
    s, _ = svc(env, "Oui [1]")
    with pytest.raises(ValidationFailed):
        s.ask(1, "   ")
    with pytest.raises(ValidationFailed):
        s.ask(1, "x" * 5000)
    _, msg, _ = s.ask(1, "Le télétravail ?")
    s.feedback(1, msg.id, 1)
    assert s.conversations.msgs[msg.conversation_id][-1].feedback == 1
    with pytest.raises(NotFound):
        s.feedback(2, msg.id, 1)
    with pytest.raises(ValidationFailed):
        s.feedback(1, msg.id, 5)
