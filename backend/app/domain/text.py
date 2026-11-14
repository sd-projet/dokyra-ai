from __future__ import annotations

import re
import unicodedata

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_text(text: str) -> str:
    """Normalise le texte extrait (PDF surtout) : recolle les mots coupés en fin de ligne,
    réunit les lignes d'un même paragraphe, supprime espaces et sauts de ligne en excès."""
    text = unicodedata.normalize("NFC", text.replace("\r\n", "\n").replace("\r", "\n"))
    text = _CONTROL.sub("", text).replace(" ", " ").replace("­", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)           # « télé-\ntravail » -> « télétravail »
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"(?<![.!?:;\n])\n(?!\n|[-•*\d#|])", " ", text)  # ligne coupée au milieu d'une phrase
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
