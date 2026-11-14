import json

from app.application.ask_question import NOT_FOUND_TEXT, extract_citations, parse_json_answer
from app.domain.entities import Usage


def test_extract_citations_handles_groups_and_out_of_range():
    assert extract_citations("A [1] et B [2, 3][5] mais [0] [12]", 3) == [1, 2, 3]
    assert extract_citations("rien", 3) == []


def test_parse_json_answer_tolerates_fences_and_noise():
    raw = '```json\n{"found": true, "answer": "Oui [1]", "key_points": ["a"]}\n```'
    assert parse_json_answer(raw)["answer"] == "Oui [1]"
    assert parse_json_answer('Voici : {"answer": "ok"} merci')["answer"] == "ok"
    assert parse_json_answer("pas du json") is None
    assert parse_json_answer('{"foo": 1}') is None


def test_answer_has_sources_citations_usage_and_cost(env):
    env["seed"]("Règlement", "2024", "Le télétravail est autorisé 3 jours par semaine après 6 mois.", page=4)
    llm, ask = env["make"]("Trois jours par semaine [1].")
    a = ask.execute("Quelles conditions pour le télétravail ?", user_id=7)
    assert a.text.startswith("Trois jours") and a.cited == [1] and a.found
    assert (a.sources[0].title, a.sources[0].page) == ("Règlement", 4)
    assert "[1] (Règlement v2024, page 4)" in llm.calls[0]["user"]
    user, op, usage = env["repo"].rows[0]
    assert (user, op, usage.prompt_tokens) == (7, "ask", 100)
    assert a.usage.cost_usd == (100 * 1.0 + 20 * 2.0) / 1_000_000


def test_no_documents_means_no_llm_call(env):
    llm, ask = env["make"]("jamais appelé")
    a = ask.execute("Une question ?")
    assert a.text == NOT_FOUND_TEXT and not a.found and a.sources == [] and llm.calls == []


def test_follow_up_question_is_condensed_and_history_forwarded(env):
    env["seed"]("Règlement", "2024", "Le télétravail est limité à 3 jours.")
    llm, ask = env["make"]("Quelles sont les conditions du télétravail ?", "Réponse [1]")
    history = [("user", "Parle-moi du télétravail"), ("assistant", "C'est limité.")]
    a = ask.execute("Et les conditions ?", history=history)
    assert a.standalone_question == "Quelles sont les conditions du télétravail ?"
    assert a.sources, "la recherche doit utiliser la question reformulée, pas « Et les conditions ? »"
    assert llm.calls[1]["history"] == history
    assert [r[1] for r in env["repo"].rows] == ["condense", "ask"]


def test_structured_mode_parses_json(env):
    env["seed"]("Règlement", "2024", "Le télétravail est autorisé.")
    payload = json.dumps({"found": True, "answer": "Autorisé [1]", "key_points": ["Autorisé"], "confidence": "high"})
    llm, ask = env["make"](payload)
    a = ask.execute("télétravail ?", structured=True)
    assert (a.text, a.key_points, a.confidence, a.cited) == ("Autorisé [1]", ["Autorisé"], "high", [1])
    assert llm.calls[0]["json_mode"] and "JSON" in llm.calls[0]["system"]


def test_structured_mode_falls_back_to_raw_text_on_invalid_json(env):
    env["seed"]("Règlement", "2024", "Le télétravail est autorisé.")
    _, ask = env["make"]("Réponse en texte libre [1]")
    a = ask.execute("télétravail ?", structured=True)
    assert a.text == "Réponse en texte libre [1]" and a.key_points == [] and a.confidence is None


def test_stream_yields_tokens_then_recorded_usage(env):
    env["seed"]("Règlement", "2024", "Le télétravail est autorisé.")
    _, ask = env["make"]("Bon|jour [1]")
    passages, it = ask.stream("télétravail ?", user_id=3)
    items = list(it)
    assert items[:2] == ["Bon", "jour [1]"] and isinstance(items[-1], Usage) and items[-1].cost_usd > 0
    assert passages and env["repo"].rows[0][0] == 3


def test_document_filter_restricts_search(env):
    a = env["seed"]("Politique 2023", "1", "Le télétravail est limité à 1 jour.")
    b = env["seed"]("Politique 2025", "2", "Le télétravail est autorisé 3 jours.")
    _, ask = env["make"]("ok")
    assert {p.title for p in ask.retrieve("télétravail", [b.id])} == {"Politique 2025"}
    assert {p.title for p in ask.retrieve("télétravail")} == {"Politique 2023", "Politique 2025"}
