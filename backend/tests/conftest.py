"""Configuration pytest pour les tests backend TriMaint."""

import os
import sys
from pathlib import Path

# Mode test pour bypass des variables d'env obligatoires
os.environ["TEST_MODE"] = "1"

# Path backend
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402


_TEST_PASSWORD = "TestPassword123"


@pytest.fixture(scope="function")
def db_session():
    """Session DB de test — moteur SQLite en mémoire créé par test pour isolation stricte."""
    _engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=_engine)
    session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=_engine)
        _engine.dispose()


@pytest.fixture(scope="function")
def client(db_session):
    """Client de test FastAPI avec DB override."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db_session):
    """Factory : crée un utilisateur avec le rôle donné.

    Usage : user = make_user("admin")  ou  make_user("technicien", username="bob")
    """

    def _make(role: str, username: str | None = None) -> User:
        _username = username or f"{role}_test"
        user = User(
            username=_username,
            email=f"{_username}@test.com",
            hashed_password=get_password_hash(_TEST_PASSWORD),
            role=role,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _make


@pytest.fixture
def admin_user(make_user):
    return make_user("admin", username="admin_test")


@pytest.fixture
def tech_user(make_user):
    return make_user("technicien", username="tech_test")


@pytest.fixture
def lecteur_user(make_user):
    return make_user("lecteur", username="lecteur_test")


@pytest.fixture
def chef_equipe_user(make_user):
    return make_user("chef_equipe", username="chef_test")


def _login(client, username: str) -> str:
    response = client.post(
        "/api/auth/login",
        data={"username": username, "password": _TEST_PASSWORD},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture
def admin_token(client, admin_user):
    return _login(client, admin_user.username)


@pytest.fixture
def tech_token(client, tech_user):
    return _login(client, tech_user.username)


@pytest.fixture
def lecteur_token(client, lecteur_user):
    return _login(client, lecteur_user.username)


@pytest.fixture
def chef_equipe_token(client, chef_equipe_user):
    return _login(client, chef_equipe_user.username)


def auth_headers(token: str) -> dict:
    """Helper pour construire les headers d'auth."""
    return {"Authorization": f"Bearer {token}"}
