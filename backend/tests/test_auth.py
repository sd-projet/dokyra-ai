import pytest

from app.application.auth_service import MAX_FAILURES, AuthService
from app.domain.errors import InvalidCredentials, TooManyAttempts, ValidationFailed
from app.infrastructure.security import PasswordHasher, TokenService
from tests.fakes import FakeUserRepo


def make(clock=lambda: 0.0):
    return AuthService(FakeUserRepo(), PasswordHasher(), TokenService("s" * 32, 1), clock)


def test_hash_verify_and_unique_salt():
    h = PasswordHasher()
    a, b = h.hash("secret-123"), h.hash("secret-123")
    assert a != b and h.verify("secret-123", a) and not h.verify("autre", a) and not h.verify("x", "garbage")


def test_login_token_roundtrip_and_roles():
    auth = make()
    auth.ensure_admin("admin", "pw-admin-1")
    auth.ensure_admin("autre", "x")  # ignoré : la base contient déjà un utilisateur
    token, user = auth.login("ADMIN", "pw-admin-1")
    p = auth.principal(token)
    assert (p.username, p.role, p.is_admin) == ("admin", "admin", True) and len(auth.list_users()) == 1
    auth.create_user("Alice", "motdepasse1", "user")
    _, u = auth.login("alice", "motdepasse1")
    assert not auth.principal(auth.tokens.create(u)).is_admin


def test_bad_credentials_and_forged_token():
    auth = make()
    auth.ensure_admin("admin", "pw-admin-1")
    for u, pw in [("admin", "faux"), ("inconnu", "x")]:
        with pytest.raises(InvalidCredentials):
            auth.login(u, pw)
    with pytest.raises(InvalidCredentials):
        auth.principal("pas.un.jeton")
    forged = TokenService("autre-secret-" + "x" * 20).create(auth.users.get_by_username("admin"))
    with pytest.raises(InvalidCredentials):
        auth.principal(forged)


def test_lockout_after_repeated_failures_then_expires():
    now = [0.0]
    auth = make(lambda: now[0])
    auth.ensure_admin("admin", "pw-admin-1")
    for _ in range(MAX_FAILURES):
        with pytest.raises(InvalidCredentials):
            auth.login("admin", "faux")
    with pytest.raises(TooManyAttempts):
        auth.login("admin", "pw-admin-1")  # même le bon mot de passe est refusé
    now[0] = 301
    assert auth.login("admin", "pw-admin-1")


def test_create_user_validation():
    auth = make()
    auth.create_user("bob", "motdepasse1", "user")
    for args in [("b", "motdepasse1", "user"), ("bob2", "court", "user"), ("bob3", "motdepasse1", "root"),
                 ("bob", "motdepasse1", "user"), ("Bad Name!", "motdepasse1", "user")]:
        with pytest.raises(ValidationFailed):
            auth.create_user(*args)


def _admin_and_alice():
    auth = make()
    auth.ensure_admin("admin", "pw-admin-1")
    admin = auth.principal(auth.login("admin", "pw-admin-1")[0])
    alice = auth.create_user("alice", "motdepasse1", "user")
    return auth, admin, alice


def test_delete_user_removes_account():
    auth, admin, alice = _admin_and_alice()
    assert auth.delete_user(alice.id, admin).username == "alice"
    assert [u.username for u in auth.list_users()] == ["admin"]
    with pytest.raises(InvalidCredentials):
        auth.login("alice", "motdepasse1")


def test_delete_user_unknown_is_not_found():
    from app.domain.errors import NotFound
    auth, admin, _ = _admin_and_alice()
    with pytest.raises(NotFound):
        auth.delete_user(999, admin)


def test_cannot_delete_yourself():
    auth, admin, _ = _admin_and_alice()
    with pytest.raises(ValidationFailed):
        auth.delete_user(admin.id, admin)
    assert len(auth.list_users()) == 2


def test_cannot_delete_last_admin_but_can_when_another_exists():
    auth, admin, alice = _admin_and_alice()
    # alice (user) agit comme principal d'un autre admin factice : le dernier admin reste protégé
    from app.domain.entities import Principal
    other = Principal(alice.id, "alice", "admin")
    with pytest.raises(ValidationFailed):
        auth.delete_user(admin.id, other)
    bob = auth.create_user("bob", "motdepasse1", "admin")
    auth.delete_user(bob.id, admin)
    assert {u.username for u in auth.list_users()} == {"admin", "alice"}