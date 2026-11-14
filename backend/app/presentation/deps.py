from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..domain.entities import Principal
from ..domain.errors import InvalidCredentials
from .container import Container

bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


def current_principal(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                      c: Container = Depends(get_container)) -> Principal:
    if creds is None:
        raise HTTPException(401, "Authentification requise.", headers={"WWW-Authenticate": "Bearer"})
    try:
        return c.auth.principal(creds.credentials)
    except InvalidCredentials as e:
        raise HTTPException(401, str(e), headers={"WWW-Authenticate": "Bearer"})


def require_admin(p: Principal = Depends(current_principal)) -> Principal:
    if not p.is_admin:
        raise HTTPException(403, "Réservé aux administrateurs.")
    return p
