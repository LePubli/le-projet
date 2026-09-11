"""Configuration pytest pour les tests backend TriMaint."""
import os
import sys
from pathlib import Path

# Mode test pour bypass des variables d'env obligatoires
os.environ["TEST_MODE"] = "1"

# Path backend
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.user import User
from app.core.security import get_password_hash


# Base SQLite en mémoire pour les tests
SQLALCHEMY_TEST_URL = "sqlite://"
engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Session DB de test (SQLite en mémoire, recréée pour chaque test)."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


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
def admin_user(db_session):
    """Crée un utilisateur admin de test."""
    user = User(
        username="admin_test",
        email="admin@test.com",
        hashed_password=get_password_hash("TestPassword123"),
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def tech_user(db_session):
    """Crée un utilisateur technicien de test."""
    user = User(
        username="tech_test",
        email="tech@test.com",
        hashed_password=get_password_hash("TestPassword123"),
        role="technicien",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_token(client, admin_user):
    """Récupère un token admin."""
    response = client.post(
        "/api/auth/login",
        data={"username": "admin_test", "password": "TestPassword123"},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture
def tech_token(client, tech_user):
    """Récupère un token technicien."""
    response = client.post(
        "/api/auth/login",
        data={"username": "tech_test", "password": "TestPassword123"},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


def auth_headers(token: str) -> dict:
    """Helper pour construire les headers d'auth."""
    return {"Authorization": f"Bearer {token}"}
