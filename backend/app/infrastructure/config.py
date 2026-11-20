from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SECRETS = {"change-me", ""}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"  # "production" refuse de démarrer avec les secrets par défaut
    database_url: str = "postgresql+psycopg://dokyra:dokyra@db:5432/dokyra"

    # --- LLM (OpenAI ou tout fournisseur compatible : Mistral, Groq, Ollama, vLLM… via base_url)
    openai_api_key: str = ""
    openai_base_url: str | None = None
    llm_model: str = "gpt-4o-mini"
    available_models: str = "gpt-4o-mini"  # modèles autorisés pour la comparaison (séparés par des virgules)
    model_prices: dict[str, tuple[float, float]] = {}  # {"mon-modele": [prix_entrée, prix_sortie]} USD / 1M tokens
    llm_timeout: int = 60

    # --- RAG
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dim: int = 384  # doit correspondre au modèle d'embeddings
    reranker_model: str = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
    use_reranker: bool = True
    chunk_size: int = 800
    chunk_overlap: int = 120
    retrieval_k: int = 20
    retrieval_top_n: int = 5
    max_upload_mb: int = 20

    # --- Sécurité
    jwt_secret: str = "change-me"
    jwt_hours: int = 8
    admin_user: str = "admin"
    admin_password: str = "admin"
    cors_origins: str = "http://localhost:4200"

    reports_dir: str = "reports"

    @field_validator("database_url")
    @classmethod
    def _driver(cls, v: str) -> str:
        """Render/Heroku fournissent « postgres:// » ou « postgresql:// » : on impose le pilote psycopg (v3)."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def models(self) -> list[str]:
        names = [m.strip() for m in self.available_models.split(",") if m.strip()]
        return names if self.llm_model in names else [self.llm_model, *names]

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def assert_secure(self) -> list[str]:
        """Renvoie les avertissements ; en production, lève une erreur si un secret est faible."""
        problems = []
        if self.jwt_secret in _DEFAULT_SECRETS or len(self.jwt_secret) < 16:
            problems.append("JWT_SECRET est faible ou par défaut")
        if self.admin_password in {"admin", ""}:
            problems.append("ADMIN_PASSWORD est « admin » (ou vide)")
        if problems and self.app_env == "production":
            raise RuntimeError("Configuration non sécurisée : " + " ; ".join(problems))
        return problems


settings = Settings()