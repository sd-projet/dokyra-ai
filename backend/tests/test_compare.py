import pytest

from app.application.compare_documents import CompareDocuments
from app.application.compare_models import CompareModels
from app.domain.errors import NotFound, ValidationFailed
from tests.fakes import FakeLLM


def setup(env):
    old = env["seed"]("Politique télétravail", "2023", "Le télétravail est limité à 1 jour par semaine.", page=2)
    new = env["seed"]("Politique télétravail", "2025", "Le télétravail est autorisé 3 jours par semaine.", page=5)
    llm, ask = env["make"]("## Résumé\nPassage de 1 à 3 jours.")
    return old, new, llm, CompareDocuments(ask, llm, env["store"], env["tracker"])


def test_compare_two_documents_builds_labelled_prompt(env):
    old, new, llm, cmp = setup(env)
    r = cmp.execute(old.id, new.id, "télétravail", user_id=1)
    user = llm.calls[0]["user"]
    assert "DOCUMENT A : Politique télétravail v2023" in user and "DOCUMENT B : Politique télétravail v2025" in user
    assert "1 jour" in user and "3 jours" in user and "page 5" in user
    assert r.markdown.startswith("## Résumé") and env["repo"].rows[-1][1] == "compare"


def test_compare_latest_picks_two_most_recent_versions(env):
    old, new, llm, cmp = setup(env)
    env["seed"]("Autre document", "1", "Congé annuel.")
    r = cmp.execute_latest("télétravail", "télétravail")
    assert (r.doc_a.id, r.doc_b.id) == (old.id, new.id)


def test_compare_errors(env):
    old, new, llm, cmp = setup(env)
    with pytest.raises(ValidationFailed):
        cmp.execute(old.id, old.id, "x")
    with pytest.raises(ValidationFailed):
        cmp.execute(old.id, new.id, "  ")
    with pytest.raises(NotFound):
        cmp.execute(old.id, 999, "x")
    with pytest.raises(NotFound):
        cmp.execute_latest("inexistant", "x")


def test_compare_models_runs_each_model_and_isolates_failures(env):
    env["seed"]("Règlement", "1", "Le télétravail est autorisé.")
    llm = FakeLLM("réponse")
    _, ask = env["make"]("x")

    class Flaky(FakeLLM):
        def complete(self, system, user, *, history=None, model=None, json_mode=False):
            if model == "broken":
                raise RuntimeError("quota dépassé")
            return super().complete(system, user, history=history, model=model)

    cm = CompareModels(ask, Flaky("réponse"), env["tracker"], ["m1", "m2", "broken"])
    out = cm.execute("télétravail ?", ["m1", "m2", "broken", "m1"], user_id=2)
    runs = {r.model: r for r in out["runs"]}
    assert list(runs) == ["m1", "m2", "broken"]  # doublon supprimé
    assert runs["m1"].usage.cost_usd == 0 or runs["m1"].usage.model == "m1"
    assert runs["broken"].error and "quota" in runs["broken"].error and runs["broken"].usage is None
    assert len(env["repo"].rows) == 2  # seuls les appels réussis sont comptabilisés
    with pytest.raises(ValidationFailed):
        cm.execute("q", ["inconnu"])
    with pytest.raises(ValidationFailed):
        cm.execute("q", [])
