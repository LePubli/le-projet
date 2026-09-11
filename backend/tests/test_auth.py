"""Tests du module authentification."""
from tests.conftest import auth_headers


def test_health_no_auth(client):
    """L'endpoint de santé doit fonctionner sans auth."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_success(client, admin_user):
    """Login avec bons identifiants."""
    response = client.post(
        "/api/auth/login",
        data={"username": "admin_test", "password": "TestPassword123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, admin_user):
    """Login avec mauvais mot de passe."""
    response = client.post(
        "/api/auth/login",
        data={"username": "admin_test", "password": "WrongPassword"},
    )
    assert response.status_code == 401
    assert "incorrects" in response.json()["detail"].lower()


def test_login_nonexistent_user(client):
    """Login avec utilisateur inexistant."""
    response = client.post(
        "/api/auth/login",
        data={"username": "ghost", "password": "whatever"},
    )
    assert response.status_code == 401


def test_me_endpoint(client, admin_token):
    """Endpoint /me avec token valide."""
    response = client.get("/api/auth/me", headers=auth_headers(admin_token))
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin_test"
    assert data["role"] == "admin"


def test_me_without_token(client):
    """Endpoint /me sans token = 401."""
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_create_user_as_admin(client, admin_token):
    """Admin peut créer un utilisateur."""
    response = client.post(
        "/api/auth/users",
        json={
            "username": "new_user",
            "email": "new@test.com",
            "password": "NewPassword123",
            "role": "technicien",
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["username"] == "new_user"


def test_create_user_as_tech_forbidden(client, tech_token):
    """Technicien ne peut pas créer d'utilisateur."""
    response = client.post(
        "/api/auth/users",
        json={
            "username": "new_user",
            "email": "new@test.com",
            "password": "NewPassword123",
            "role": "technicien",
        },
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 403


def test_create_user_short_password_rejected(client, admin_token):
    """Mot de passe trop court rejeté par Pydantic."""
    response = client.post(
        "/api/auth/users",
        json={
            "username": "new_user",
            "email": "new@test.com",
            "password": "short",
            "role": "technicien",
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_create_user_invalid_role_rejected(client, admin_token):
    """Rôle invalide rejeté par Pydantic."""
    response = client.post(
        "/api/auth/users",
        json={
            "username": "new_user",
            "email": "new@test.com",
            "password": "ValidPassword123",
            "role": "superadmin",
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422
