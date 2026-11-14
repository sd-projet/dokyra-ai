from __future__ import annotations

from ..domain.entities import Usage
from ..domain.pricing import estimate_cost


class UsageTracker:
    """Calcule le coût estimé d'un appel LLM et l'enregistre (suivi tokens / coûts, bloc A)."""

    def __init__(self, repo=None, prices: dict[str, tuple[float, float]] | None = None):
        self.repo, self.prices = repo, prices or {}

    def price(self, usage: Usage) -> Usage:
        usage.cost_usd = estimate_cost(usage.model, usage.prompt_tokens, usage.completion_tokens, self.prices)
        return usage

    def record(self, user_id: int | None, operation: str, usage: Usage | None) -> Usage | None:
        if usage is None:
            return None
        self.price(usage)
        if self.repo is not None:
            try:
                self.repo.add(user_id, operation, usage)
            except Exception:  # le suivi ne doit jamais casser une réponse
                import logging
                logging.getLogger(__name__).exception("Enregistrement de l'usage impossible")
        return usage

    def summary(self, user_id: int | None = None, days: int = 30) -> dict:
        return self.repo.summary(user_id, days) if self.repo is not None else {}
