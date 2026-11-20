"""Télécharge les modèles Hugging Face dans le cache (exécuté au build de l'image Docker)."""
from huggingface_hub import snapshot_download

from app.infrastructure.config import Settings


def main() -> None:
    s = Settings()
    names = [s.embedding_model] + ([s.reranker_model] if s.use_reranker else [])
    for name in names:
        print(f"téléchargement de {name}…")
        snapshot_download(name)


if __name__ == "__main__":
    main()