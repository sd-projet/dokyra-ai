from __future__ import annotations

# Prix indicatifs en USD pour 1 million de tokens : (entrée, sortie).
# Ils changent régulièrement : surchargez-les avec la variable MODEL_PRICES (JSON) dans .env.
DEFAULT_PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int,
                  prices: dict[str, tuple[float, float]] | None = None) -> float:
    """Coût estimé en USD. Un modèle inconnu coûte 0 (ex. modèle local). Correspondance
    exacte, sinon par préfixe le plus long (ex. « gpt-4o-mini-2024-07-18 » -> « gpt-4o-mini »)."""
    table = {**DEFAULT_PRICES, **(prices or {})}
    name = model.lower()
    if name in table:
        pin, pout = table[name]
    else:
        matches = [m for m in table if name.startswith(m.lower())]
        if not matches:
            return 0.0
        pin, pout = table[max(matches, key=len)]
    return round((prompt_tokens * pin + completion_tokens * pout) / 1_000_000, 6)
