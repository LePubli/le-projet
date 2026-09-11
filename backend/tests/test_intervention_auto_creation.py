"""Tests de l'auto-création d'intervention et notification lors de la création d'une panne."""

from tests.conftest import auth_headers
from app.models.machine import Machine
from app.models.convoyeur import Convoyeur
from app.models.intervention import Intervention
from app.models.notification import Notification


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


def _create_convoyeur(db_session):
    """Helper pour créer un convoyeur de test."""
    convoyeur = Convoyeur(
        nom="Convoyeur test",
        code_interne="CONV-001",
        ligne="L1",
        zone="Z1",
    )
    db_session.add(convoyeur)
    db_session.commit()
    db_session.refresh(convoyeur)
    return convoyeur


def test_create_panne_auto_creates_intervention(client, admin_token, db_session):
    """La création d'une panne (machine) auto-crée une intervention non assignée liée."""
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
    panne_id = response.json()["id"]

    interventions = db_session.query(Intervention).all()
    assert len(interventions) == 1
    intervention = interventions[0]
    assert intervention.panne_id == panne_id
    assert intervention.technicien is None
    assert intervention.machine_id == machine.id


def test_create_panne_with_both_machine_and_convoyeur_rejected(client, admin_token, db_session):
    """Fournir machine_id ET convoyeur_id doit être rejeté (422)."""
    machine = _create_machine(db_session)
    convoyeur = _create_convoyeur(db_session)
    response = client.post(
        "/api/pannes/",
        json={
            "machine_id": machine.id,
            "convoyeur_id": convoyeur.id,
            "titre": "Panne test",
            "criticite": 3,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_create_panne_with_neither_machine_nor_convoyeur_rejected(client, admin_token, db_session):
    """Ne fournir ni machine_id ni convoyeur_id doit être rejeté (422)."""
    response = client.post(
        "/api/pannes/",
        json={
            "titre": "Panne test",
            "criticite": 3,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 422


def test_create_panne_with_convoyeur_auto_creates_intervention(client, admin_token, db_session):
    """La création d'une panne (convoyeur) auto-crée une intervention liée au convoyeur."""
    convoyeur = _create_convoyeur(db_session)
    response = client.post(
        "/api/pannes/",
        json={
            "convoyeur_id": convoyeur.id,
            "titre": "Panne convoyeur test",
            "criticite": 2,
        },
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200

    interventions = db_session.query(Intervention).all()
    assert len(interventions) == 1
    intervention = interventions[0]
    assert intervention.convoyeur_id == convoyeur.id
    assert intervention.machine_id is None


def test_create_panne_creates_notification_for_chef_equipe_and_admin(
    client, admin_token, db_session
):
    """Une notification est créée pour l'intervention auto-créée, ciblant chef_equipe/admin."""
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

    intervention = db_session.query(Intervention).one()
    notifications = (
        db_session.query(Notification).filter(Notification.entity_type == "intervention").all()
    )
    assert len(notifications) == 1
    notification = notifications[0]
    assert notification.entity_id == intervention.id
    assert notification.target_roles == ["chef_equipe", "admin"]
