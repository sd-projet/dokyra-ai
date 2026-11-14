from __future__ import annotations

import re
import time
from typing import Callable

from ..domain.entities import ROLE_ADMIN, ROLES, Principal, User
from ..domain.errors import InvalidCredentials, NotFound, TooManyAttempts, ValidationFailed

MAX_FAILURES = 5
WINDOW_SECONDS = 300


class AuthService:
    def __init__(self, users, hasher, tokens, clock: Callable[[], float] = time.monotonic):
        self.users, self.hasher, self.tokens, self.clock = users, hasher, tokens, clock
        self._failures: dict[str, list[float]] = {}

    def ensure_admin(self, username: str, password: str) -> None:
        """Crée l'administrateur initial si la base ne contient encore aucun utilisateur."""
        if self.users.count() == 0:
            self.users.add(User(None, username, self.hasher.hash(password), ROLE_ADMIN))

    def login(self, username: str, password: str) -> tuple[str, User]:
        key = username.strip().lower()
        now = self.clock()
        recent = [t for t in self._failures.get(key, []) if now - t < WINDOW_SECONDS]
        if len(recent) >= MAX_FAILURES:
            raise TooManyAttempts("Trop de tentatives. Réessayez dans quelques minutes.")
        user = self.users.get_by_username(key)
        # on vérifie toujours un hash, pour ne pas révéler par le temps de réponse si l'utilisateur existe
        ok = self.hasher.verify(password, user.password_hash if user else self.hasher.hash("dummy"))
        if not user or not ok:
            self._failures[key] = recent + [now]
            raise InvalidCredentials("Identifiants incorrects.")
        self._failures.pop(key, None)
        return self.tokens.create(user), user

    def principal(self, token: str) -> Principal:
        return self.tokens.decode(token)

    def create_user(self, username: str, password: str, role: str) -> User:
        username = username.strip().lower()
        if not re.fullmatch(r"[a-z0-9._-]{3,50}", username):
            raise ValidationFailed("Nom d'utilisateur : 3 à 50 caractères (lettres, chiffres, . _ -).")
        if len(password) < 8:
            raise ValidationFailed("Mot de passe : 8 caractères minimum.")
        if role not in ROLES:
            raise ValidationFailed(f"Rôle invalide ({', '.join(sorted(ROLES))}).")
        if self.users.get_by_username(username):
            raise ValidationFailed("Ce nom d'utilisateur existe déjà.")
        return self.users.add(User(None, username, self.hasher.hash(password), role))

    def list_users(self) -> list[User]:
        return self.users.list()

    def delete_user(self, user_id: int, acting: Principal) -> User:
        """Supprime un compte (et, en cascade, ses conversations). Garde-fous : pas soi-même, pas le dernier admin."""
        target = self.users.get(user_id)
        if not target:
            raise NotFound("Utilisateur introuvable.")
        if target.id == acting.id:
            raise ValidationFailed("Vous ne pouvez pas supprimer votre propre compte.")
        if target.role == ROLE_ADMIN and sum(1 for u in self.users.list() if u.role == ROLE_ADMIN) <= 1:
            raise ValidationFailed("Impossible de supprimer le dernier administrateur.")
        self.users.delete(user_id)
        self._failures.pop(target.username, None)
        return target