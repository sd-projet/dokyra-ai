import pytest

from app.domain.calculator import calculate
from app.domain.entities import Passage
from app.domain.errors import ValidationFailed
from app.domain.pricing import estimate_cost
from app.domain.ranking import reciprocal_rank_fusion
from app.domain.text import clean_text


def P(cid, content="x"):
    return Passage(1, "T", "1", 1, content, 0.0, cid)


def test_rrf_favours_passages_present_in_both_lists():
    fused = reciprocal_rank_fusion([[P(1), P(2), P(3)], [P(3), P(4), P(1)]])
    assert [p.chunk_id for p in fused][:2] == [1, 3]
    assert len(fused) == 4 and all(p.score > 0 for p in fused)


def test_rrf_empty():
    assert reciprocal_rank_fusion([[], []]) == []


@pytest.mark.parametrize("expr,expected", [
    ("3*52 - 11", "145"), ("(120-90)/120*100", "25"), ("2^10", "1024"), ("10/4", "2.5"),
    ("1,5 + 1", "2.5"), ("round(10/3, 2)", "3.33"), ("max(2, 9) * 2", "18")])
def test_calculator_ok(expr, expected):
    assert calculate(expr) == expected


@pytest.mark.parametrize("expr", ["__import__('os').system('ls')", "1/0", "2**10000", "a+1", "", "open('x')", "(1).real"])
def test_calculator_rejects_unsafe_or_invalid(expr):
    with pytest.raises(ValidationFailed):
        calculate(expr)


def test_cost_exact_prefix_and_unknown():
    assert estimate_cost("gpt-4o-mini", 1_000_000, 1_000_000) == pytest.approx(0.75)
    assert estimate_cost("gpt-4o-mini-2024-07-18", 1_000_000, 0) == pytest.approx(0.15)  # préfixe le plus long
    assert estimate_cost("llama-local", 5000, 5000) == 0.0
    assert estimate_cost("mine", 1_000_000, 0, {"mine": (3.0, 6.0)}) == pytest.approx(3.0)


def test_clean_text_rejoins_hyphenation_and_wrapped_lines():
    raw = "Le télé-\ntravail est ouvert aux salariés\nayant 6 mois d'ancienneté.\n\n\n\n- Point A\n- Point B"
    out = clean_text(raw)
    assert "télétravail est ouvert aux salariés ayant 6 mois d'ancienneté." in out
    assert "\n\n- Point A\n- Point B" in out and "\n\n\n" not in out
