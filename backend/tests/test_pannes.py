"""Tests des endpoints pannes : validation, autorisations."""
from tests.conftest import auth_headers
from app.models.machine import Machine


def _create_machine(db_session):
    """Helper pour créer une machine de test."""
    machine = Machine(
        nom="Machine test",
        site="Site A",
        ligne="L1",
        zone="Z1",
        code_interne="TEST-001",
        statut="actif",
    )
    db_session.add(machine)
    db_session.commit()
    db_session.refresh(machine)
    return machine


def test_create_panne_valid_criticite(client, admin_token, db_session):
    """Création de panne avec criticite valide (1-5)."""
    machine = _create_machine(db_session)
    response = client.post(
        "/api/pannes/",
        json={
            "machine_id": machine.id,
            "titre": "Panne test",
            "criticite": 3,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["criticite"] == 3


def test_create_panne_criticite_too_high_rejected(client, admin_token, db_session):
    """Criticite > 5 doit être rejetée par Pydantic."""
    machine = _create_machine(db_session)
    response = client.post(
        "/api/pannes/",
        json={
            "machine_id": machine.id,
            "titre": "Panne test",
            "criticite": 999,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_create_panne_criticite_zero_rejected(client, admin_token, db_session):
    """Criticite = 0 doit être rejetée."""
    machine = _create_machine(db_session)
    response = client.post(
        "/api/pannes/",
        json={
            "machine_id": machine.id,
            "titre": "Panne test",
            "criticite": 0,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_create_panne_criticite_negative_rejected(client, admin_token, db_session):
    """Criticite négative doit être rejetée."""
    machine = _create_machine(db_session)
    response = client.post(
        "/api/pannes/",
        json={
            "machine_id": machine.id,
            "titre": "Panne test",
            "criticite": -1,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_list_pannes_requires_auth(client):
    """Sans auth, on doit avoir 401."""
    response = client.get("/api/pannes/")
    assert response.status_code == 401


def test_tech_can_create_panne(client, tech_token, db_session):
    """Technicien peut créer une panne (signaler)."""
    machine = _create_machine(db_session)
    response = client.post(
        "/api/pannes/",
        json={
            "machine_id": machine.id,
            "titre": "Panne signalée par tech",
            "criticite": 2,
        },
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 200


def test_tech_cannot_delete_panne(client, tech_token, db_session):
    """Technicien NE peut PAS supprimer une panne (require_manager_or_admin)."""
    from app.models.panne import Panne
    machine = _create_machine(db_session)
    panne = Panne(machine_id=machine.id, titre="Test", criticite=3)
    db_session.add(panne)
    db_session.commit()
    db_session.refresh(panne)

    response = client.delete(
        f"/api/pannes/{panne.id}",
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 403


def test_manager_can_delete_panne(client, admin_token, db_session):
    """Admin peut supprimer une panne."""
    from app.models.panne import Panne
    machine = _create_machine(db_session)
    panne = Panne(machine_id=machine.id, titre="Test", criticite=3)
    db_session.add(panne)
    db_session.commit()
    db_session.refresh(panne)

    response = client.delete(
        f"/api/pannes/{panne.id}",
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200
