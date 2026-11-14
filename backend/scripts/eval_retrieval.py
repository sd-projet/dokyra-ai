"""Mesure la qualité de la recherche (recall@k) sur un jeu de questions annoté.

    python -m scripts.eval_retrieval scripts/eval_example.json

Format : [{"question": "...", "title": "Politique de télétravail", "version": "2025", "page": 1}, ...]
(`version` et `page` sont optionnels.) Une question est « réussie » si l'un des passages retenus
correspond au document (et à la page) attendus. À lancer dans le conteneur backend, base remplie.
"""
import json
import sys

from app.infrastructure.config import settings
from app.presentation.container import build_container


def main(path: str):
    c = build_container(settings)
    asker = c.chat.asker
    cases = json.load(open(path, encoding="utf-8"))
    hits = 0
    for case in cases:
        passages = asker.retrieve(case["question"])
        ok = any(p.title == case["title"] and (not case.get("version") or p.version == case["version"])
                 and (not case.get("page") or p.page == case["page"]) for p in passages)
        hits += ok
        print(("OK  " if ok else "MISS"), case["question"])
    print(f"\nrecall@{asker.top_n} = {hits}/{len(cases)} = {hits / max(len(cases), 1):.0%}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "scripts/eval_example.json")
