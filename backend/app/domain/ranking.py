from __future__ import annotations

from dataclasses import replace

from .entities import Passage


def _key(p: Passage):
    return p.chunk_id if p.chunk_id is not None else (p.document_id, p.page, p.content)


def reciprocal_rank_fusion(rankings: list[list[Passage]], k: int = 60) -> list[Passage]:
    """Fusionne plusieurs classements (ex. vectoriel + plein texte) sans avoir à normaliser
    leurs scores : score(p) = somme sur chaque liste de 1 / (k + rang)."""
    scores: dict = {}
    first: dict = {}
    for ranking in rankings:
        for rank, p in enumerate(ranking, 1):
            key = _key(p)
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
            first.setdefault(key, p)
    ordered = sorted(first, key=lambda key: scores[key], reverse=True)  # tri stable
    return [replace(first[key], score=scores[key]) for key in ordered]
