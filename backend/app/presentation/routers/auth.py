from fastapi import APIRouter, Depends

from ...domain.entities import Principal
from ..container import Container
from ..deps import current_principal, get_container, require_admin
from ..schemas import LoginIn, UserIn, to_dict

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginIn, c: Container = Depends(get_container)):
    token, user = c.auth.login(body.username, body.password)
    return {"access_token": token, "token_type": "bearer", "user": {"id": user.id, "username": user.username, "role": user.role}}


@router.get("/me")
def me(p: Principal = Depends(current_principal)):
    return {"id": p.id, "username": p.username, "role": p.role}


@router.get("/users")
def users(_: Principal = Depends(require_admin), c: Container = Depends(get_container)):
    return to_dict(c.auth.list_users())


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, p: Principal = Depends(require_admin), c: Container = Depends(get_container)):
    c.auth.delete_user(user_id, p)


@router.post("/users", status_code=201)
def create_user(body: UserIn, _: Principal = Depends(require_admin), c: Container = Depends(get_container)):
    return to_dict(c.auth.create_user(body.username, body.password, body.role))