"""Tests d'autorisation sur les sous-ressources des Bons de Travail :
gammes, pièces, compteurs, visas, signatures.

Couvre le correctif sécurité documenté dans le README (§ Contrôle d'accès
insuffisant) : `require_edit_access` doit bloquer les `lecteur` en écriture,
et `require_signatory_role` doit empêcher un utilisateur de s'auto-attribuer
un rôle de visa/signature qu'il n'a pas l'autorité de porter.
"""

from tests.conftest import auth_headers
from app.models.bon_travail import BonTravail


def _create_bt(db_session, **kwargs):
    """Crée un Bon de Travail minimal directement en base pour les tests."""
    bt = BonTravail(
        numero=kwargs.pop("numero", "BT-TEST-0001"),
        titre=kwargs.pop("titre", "BT de test"),
        **kwargs,
    )
    db_session.add(bt)
    db_session.commit()
    db_session.refresh(bt)
    return bt


# ─── require_edit_access : lecteur bloqué en écriture ──────────────


def test_lecteur_cannot_add_gamme(client, lecteur_token, db_session):
    """Lecteur ne peut PAS ajouter de gamme à un BT."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/gammes",
        json={"texte_gamme": "Vérifier le niveau d'huile"},
        headers=auth_headers(lecteur_token),
    )
    assert response.status_code == 403


def test_tech_can_add_gamme(client, tech_token, db_session):
    """Technicien peut ajouter une gamme à un BT."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/gammes",
        json={"texte_gamme": "Vérifier le niveau d'huile"},
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 200


def test_lecteur_cannot_update_gamme(client, tech_token, lecteur_token, db_session):
    """Lecteur ne peut PAS mettre à jour une gamme existante."""
    bt = _create_bt(db_session)
    created = client.post(
        f"/api/bons-travail/{bt.id}/gammes",
        json={"texte_gamme": "Vérifier le niveau d'huile"},
        headers=auth_headers(tech_token),
    )
    gamme_id = created.json()["id"]
    response = client.put(
        f"/api/bons-travail/{bt.id}/gammes/{gamme_id}",
        json={"completed": True},
        headers=auth_headers(lecteur_token),
    )
    assert response.status_code == 403


def test_lecteur_cannot_add_piece(client, lecteur_token, db_session):
    """Lecteur ne peut PAS ajouter de pièce à un BT."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/pieces",
        json={"reference": "P-001", "designation": "Filtre", "quantite": 1, "cout_unitaire": 10},
        headers=auth_headers(lecteur_token),
    )
    assert response.status_code == 403


def test_tech_can_add_piece(client, tech_token, db_session):
    """Technicien peut ajouter une pièce à un BT."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/pieces",
        json={"reference": "P-001", "designation": "Filtre", "quantite": 1, "cout_unitaire": 10},
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 200


def test_lecteur_cannot_add_compteur(client, lecteur_token, db_session):
    """Lecteur ne peut PAS ajouter de compteur à un BT."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/compteurs",
        json={"nom_compteur": "Heures moteur", "valeur": 100},
        headers=auth_headers(lecteur_token),
    )
    assert response.status_code == 403


def test_lecteur_cannot_update_compteur(client, tech_token, lecteur_token, db_session):
    """Lecteur ne peut PAS mettre à jour un compteur existant."""
    bt = _create_bt(db_session)
    created = client.post(
        f"/api/bons-travail/{bt.id}/compteurs",
        json={"nom_compteur": "Heures moteur", "valeur": 100},
        headers=auth_headers(tech_token),
    )
    compteur_id = created.json()["id"]
    response = client.put(
        f"/api/bons-travail/{bt.id}/compteurs/{compteur_id}",
        json={"nom_compteur": "Heures moteur", "valeur": 150},
        headers=auth_headers(lecteur_token),
    )
    assert response.status_code == 403


def test_lecteur_cannot_add_signature(client, lecteur_token, db_session):
    """Lecteur ne peut PAS signer un BT."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/extra/bt/{bt.id}/signature",
        json={"signature_data": "data:image/png;base64,AAA", "role": "intervenant"},
        headers=auth_headers(lecteur_token),
    )
    assert response.status_code == 403


# ─── require_signatory_role : usurpation de rôle de visa/signature ─


def test_tech_can_visa_as_intervenant(client, tech_token, db_session):
    """Technicien peut viser en tant qu'Intervenant (son propre rôle)."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/visas",
        json={"role": "Intervenant", "nom": "Dupont", "visa": "OK"},
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 200


def test_tech_cannot_visa_as_responsable(client, tech_token, db_session):
    """Technicien NE peut PAS s'auto-attribuer un visa Responsable."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/visas",
        json={"role": "Responsable", "nom": "Dupont", "visa": "OK"},
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 403


def test_chef_equipe_can_visa_as_controle_qualite(client, chef_equipe_token, db_session):
    """Chef d'équipe peut viser en tant que Contrôle qualité."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/visas",
        json={"role": "Contrôle qualité", "nom": "Martin", "visa": "OK"},
        headers=auth_headers(chef_equipe_token),
    )
    assert response.status_code == 200


def test_visa_with_unknown_role_is_rejected(client, admin_token, db_session):
    """Un rôle de visa non reconnu est rejeté (400), même pour un admin."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/visas",
        json={"role": "Directeur", "nom": "Martin", "visa": "OK"},
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 400


def test_visa_without_role_is_allowed(client, tech_token, db_session):
    """Aucun rôle déclaré : rien à usurper, la création passe."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/bons-travail/{bt.id}/visas",
        json={"nom": "Dupont", "visa": "OK"},
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 200


def test_tech_can_sign_as_intervenant(client, tech_token, db_session):
    """Technicien peut signer en tant qu'intervenant (son propre rôle)."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/extra/bt/{bt.id}/signature",
        json={"signature_data": "data:image/png;base64,AAA", "role": "intervenant"},
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 200


def test_tech_cannot_sign_as_responsable(client, tech_token, db_session):
    """Technicien NE peut PAS s'auto-attribuer une signature Responsable."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/extra/bt/{bt.id}/signature",
        json={"signature_data": "data:image/png;base64,AAA", "role": "responsable"},
        headers=auth_headers(tech_token),
    )
    assert response.status_code == 403


def test_admin_can_sign_as_controle(client, admin_token, db_session):
    """Admin peut signer en tant que contrôle qualité."""
    bt = _create_bt(db_session)
    response = client.post(
        f"/api/extra/bt/{bt.id}/signature",
        json={"signature_data": "data:image/png;base64,AAA", "role": "controle"},
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200
