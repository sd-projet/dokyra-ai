class CrossEncoderReranker:
    """Reclasse les candidats avec un cross-encodeur (question + passage lus ensemble)."""

    def __init__(self, model_name: str):
        from sentence_transformers import CrossEncoder
        self._model = CrossEncoder(model_name)

    def rerank(self, query, passages, top_n):
        if not passages:
            return []
        scores = self._model.predict([(query, p.content) for p in passages])
        for p, s in zip(passages, scores):
            p.score = float(s)
        return sorted(passages, key=lambda p: p.score, reverse=True)[:top_n]


class NoReranker:
    """Repli (ou USE_RERANKER=false) : conserve l'ordre issu de la fusion vecteur + plein texte."""

    def rerank(self, query, passages, top_n):
        return passages[:top_n]
