from langchain_huggingface import HuggingFaceEmbeddings


class HFEmbedder:
    """Embeddings Hugging Face locaux (sentence-transformers), vecteurs normalisés (cosinus)."""

    def __init__(self, model_name: str):
        self._m = HuggingFaceEmbeddings(model_name=model_name, encode_kwargs={"normalize_embeddings": True})

    def embed_documents(self, texts):
        return self._m.embed_documents(texts)

    def embed_query(self, text):
        return self._m.embed_query(text)
