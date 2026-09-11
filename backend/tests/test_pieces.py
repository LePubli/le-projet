"""Tests des endpoints pieces : autorisations."""
from tests.conftest import auth_headers
from app.models.piece import Piece


def test_tech_can_list_pieces(client, tech_token):
    """Technicien peut lister les pieces."""
    response = client.get("/api/pieces/", headers=auth_headers(tech_token))
    assert response.status_code == 200


def test_tech_cannot_create_piece(client, tech_token):
    """Technicien NE peut PAS créer de piece (manager+ only)."""
    response = client.post(
        "/api/pieces/",
        json={
            "reference": "P-TEST-001",
            "nom": "Piece test",
            "stock": 10,
        },
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 403


def test_admin_can_create_piece(client, admin_token):
    """Admin peut créer une piece."""
    response = client.post(
        "/api/pieces/",
        json={
            "reference": "P-TEST-001",
            "nom": "Piece test",
            "stock": 10,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200


def test_tech_cannot_delete_piece(client, tech_token, db_session):
    """Technicien NE peut PAS supprimer une piece."""
    piece = Piece(reference="P-DEL-001", nom="Piece del", stock=5)
    db_session.add(piece)
    db_session.commit()
    db_session.refresh(piece)

    response = client.delete(
        f"/api/pieces/{piece.id}",
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 403


def test_admin_can_delete_piece(client, admin_token, db_session):
    """Admin peut supprimer une piece."""
    piece = Piece(reference="P-DEL-002", nom="Piece del", stock=5)
    db_session.add(piece)
    db_session.commit()
    db_session.refresh(piece)

    response = client.delete(
        f"/api/pieces/{piece.id}",
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200
