from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

from ..domain.entities import ModelRun, Usage
from ..domain.errors import ValidationFailed
from .ask_question import SYSTEM_PROMPT, AskQuestion
from .usage import UsageTracker


class CompareModels:
    """Bloc A : même question, mêmes passages, plusieurs modèles -> qualité, latence, coût."""

    def __init__(self, asker: AskQuestion, llm, usage: UsageTracker, allowed_models: list[str], max_models: int = 4):
        self.asker, self.llm, self.usage = asker, llm, usage
        self.allowed, self.max_models = allowed_models, max_models

    def execute(self, question: str, models: list[str], document_ids: list[int] | None = None,
                user_id: int | None = None) -> dict:
        models = list(dict.fromkeys(m.strip() for m in models if m.strip()))
        if not question.strip():
            raise ValidationFailed("La question est vide.")
        if not 1 <= len(models) <= self.max_models:
            raise ValidationFailed(f"Choisissez entre 1 et {self.max_models} modèles.")
        unknown = [m for m in models if self.allowed and m not in self.allowed]
        if unknown:
            raise ValidationFailed(f"Modèle(s) non autorisé(s) : {', '.join(unknown)}. "
                                   f"Autorisés : {', '.join(self.allowed)}")

        passages = self.asker.retrieve(question, document_ids)  # recherche faite une seule fois
        if not passages:
            raise ValidationFailed("Aucun passage pertinent : importez des documents d'abord.")
        prompt = self.asker._user_prompt(question, passages)

        def run(model: str) -> ModelRun:
            started = time.perf_counter()
            try:
                res = self.llm.complete(SYSTEM_PROMPT, prompt, model=model)
            except Exception as e:  # un modèle en échec ne doit pas faire échouer les autres
                return ModelRun(model, error=str(e)[:300])
            usage: Usage = res.usage
            usage.latency_ms = usage.latency_ms or int((time.perf_counter() - started) * 1000)
            self.usage.record(user_id, "compare_models", usage)
            return ModelRun(model, res.text, usage=usage)

        with ThreadPoolExecutor(max_workers=len(models)) as pool:
            runs = list(pool.map(run, models))
        return {"question": question, "passages": passages, "runs": runs}
