from langchain_text_splitters import RecursiveCharacterTextSplitter


class Chunker:
    """Découpage récursif : paragraphes d'abord, puis phrases, puis mots, avec chevauchement."""

    def __init__(self, size: int = 800, overlap: int = 120):
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=size, chunk_overlap=overlap,
            separators=["\n\n", "\n", ". ", "; ", ", ", " ", ""])

    def split(self, text: str) -> list[str]:
        return self._splitter.split_text(text)
