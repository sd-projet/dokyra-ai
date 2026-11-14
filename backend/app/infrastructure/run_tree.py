"""Arbre des exécutions LangChain : sert à savoir si un appel LLM a été lancé depuis un outil.

Pourquoi : les outils de l'agent (compare_documents, summarize_document) appellent déjà le LLM et
enregistrent eux-mêmes leur consommation. Sans filtre, le callback de l'agent compterait ces appels
une seconde fois, car LangChain propage les callbacks aux appels imbriqués.
Module volontairement sans dépendance à LangChain (testable seul)."""
from __future__ import annotations

import threading
from typing import Hashable


class RunTree:
    def __init__(self) -> None:
        self._parent: dict[Hashable, Hashable | None] = {}
        self._tools: set[Hashable] = set()
        self._lock = threading.Lock()  # les outils d'un même tour peuvent s'exécuter en parallèle

    def start(self, run_id: Hashable, parent_id: Hashable | None, *, is_tool: bool = False) -> None:
        with self._lock:
            self._parent[run_id] = parent_id
            if is_tool:
                self._tools.add(run_id)

    def inside_tool(self, run_id: Hashable) -> bool:
        """Vrai si l'un des ancêtres de `run_id` est un outil."""
        with self._lock:
            seen: set[Hashable] = set()
            current = self._parent.get(run_id)
            while current is not None and current not in seen:
                if current in self._tools:
                    return True
                seen.add(current)
                current = self._parent.get(current)
        return False
