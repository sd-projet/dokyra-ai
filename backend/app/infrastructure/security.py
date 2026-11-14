from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt

from ..domain.entities import Principal, User
from ..domain.errors import InvalidCredentials

_ITERATIONS = 240_000


class PasswordHasher:
    """PBKDF2-HMAC-SHA256 avec sel aléatoire (bibliothèque standard, aucune dépendance)."""

    def hash(self, password: str) -> str:
        salt = os.urandom(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
        return f"pbkdf2_sha256${_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"

    def verify(self, password: str, hashed: str) -> bool:
        try:
            algo, iterations, salt, digest = hashed.split("$")
            if algo != "pbkdf2_sha256":
                return False
            candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iterations))
            return hmac.compare_digest(candidate, base64.b64decode(digest))
        except (ValueError, TypeError):
            return False


class TokenService:
    def __init__(self, secret: str, hours: int = 8):
        self.secret, self.hours = secret, hours

    def create(self, user: User) -> str:
        exp = datetime.now(timezone.utc) + timedelta(hours=self.hours)
        return jwt.encode({"sub": user.username, "uid": user.id, "role": user.role, "exp": exp},
                          self.secret, algorithm="HS256")

    def decode(self, token: str) -> Principal:
        try:
            claims = jwt.decode(token, self.secret, algorithms=["HS256"])
            return Principal(int(claims["uid"]), claims["sub"], claims["role"])
        except (jwt.PyJWTError, KeyError, ValueError, TypeError):
            raise InvalidCredentials("Jeton invalide ou expiré.")
