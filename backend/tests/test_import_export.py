"""Tests de la logique métier import/export CSV (app/services/import_export.py)."""

import pytest

from app.models.machine import Machine
from app.models.panne import Panne
from app.models.bon_travail import BonTravail
from app.services.import_export import (
    EntiteInconnueError,
    build_example_rows,
    create_object,
    fetch_rows,
    get_entity_def,
    map_row,
    parse_csv,
)


def _machine(db_session, **kwargs):
    m = Machine(nom=kwargs.pop("nom", "Convoyeur"), **kwargs)
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    return m


# ─── get_entity_def ─────────────────────────────────────────────────────────
def test_get_entity_def_entite_connue():
    edef = get_entity_def("machines")
    assert edef["label"] == "Machines"
    assert edef["model"] is Machine


def test_get_entity_def_entite_inconnue():
    with pytest.raises(EntiteInconnueError):
        get_entity_def("inexistant")


# ─── build_example_rows ─────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "entity", ["machines", "pannes", "bons-travail", "entretien", "nettoyage", "lignes"]
)
def test_build_example_rows_colonnes_alignees(entity):
    edef = get_entity_def(entity)
    rows = build_example_rows(entity)
    assert len(rows) == 2
    for row in rows:
        assert len(row) == len(edef["columns"])


def test_build_example_rows_entite_inconnue_renvoie_vide():
    assert build_example_rows("inexistant") == [[]]


# ─── parse_csv ──────────────────────────────────────────────────────────────
def test_parse_csv_ignore_commentaires_et_lignes_vides():
    edef = get_entity_def("machines")
    content = (
        "# machines — format d'import\n"
        "nom;code_interne;site;ligne;zone;etage;fabricant;modele;statut;notes;pos_x;pos_y\n"
        "\n"
        "Convoyeur;L315;Triselec;Ligne 1;Triage;0;Skandik;C-200;operationnel;;42.5;18.3\n"
    ).encode("utf-8-sig")
    rows, errors = parse_csv(content, edef)
    assert errors == []
    assert len(rows) == 1
    assert rows[0]["nom"] == "Convoyeur"
    assert rows[0]["code_interne"] == "L315"


def test_parse_csv_fichier_vide():
    edef = get_entity_def("machines")
    rows, errors = parse_csv(b"", edef)
    assert rows == []
    assert errors[0]["message"] == "Fichier vide"


def test_parse_csv_colonne_obligatoire_manquante():
    edef = get_entity_def("machines")
    content = "code_interne;site\nL315;Triselec\n".encode("utf-8-sig")
    rows, errors = parse_csv(content, edef)
    assert any("nom" in e["message"] or e["column"] == "nom" for e in errors)


# ─── map_row ────────────────────────────────────────────────────────────────
def test_map_row_champ_obligatoire_vide_leve_erreur():
    edef = get_entity_def("machines")
    row = {"nom": "", "code_interne": "L315"}
    with pytest.raises(ValueError, match="obligatoire"):
        map_row(row, edef, db=None)


def test_map_row_conversion_types_et_defauts():
    edef = get_entity_def("machines")
    row = {"nom": "Convoyeur", "pos_x": "42.5", "etage": "1"}
    mapped = map_row(row, edef, db=None)
    assert mapped["pos_x"] == 42.5
    assert mapped["etage"] == 1
    assert mapped["statut"] == "operationnel"  # défaut appliqué


def test_map_row_type_invalide_leve_erreur():
    edef = get_entity_def("machines")
    row = {"nom": "Convoyeur", "pos_x": "pas-un-nombre"}
    with pytest.raises(ValueError):
        map_row(row, edef, db=None)


def test_map_row_causes_possibles_separees_par_pipe(db_session):
    machine = _machine(db_session, code_interne="L315")
    edef = get_entity_def("pannes")
    row = {
        "titre": "Bruit anormal",
        "machine_code": "L315",
        "causes_possibles": "Usure|Surchauffe",
    }
    mapped = map_row(row, edef, db_session)
    assert mapped["causes_possibles"] == ["Usure", "Surchauffe"]
    assert mapped["machine_id"] == machine.id


def test_map_row_fk_introuvable_leve_erreur(db_session):
    edef = get_entity_def("pannes")
    row = {"titre": "Bruit anormal", "machine_code": "INCONNU"}
    with pytest.raises(ValueError, match="introuvable"):
        map_row(row, edef, db_session)


def test_map_row_fk_obligatoire_vide_leve_erreur(db_session):
    edef = get_entity_def("pannes")
    row = {"titre": "Bruit anormal", "machine_code": ""}
    with pytest.raises(ValueError, match="obligatoire"):
        map_row(row, edef, db_session)


# ─── create_object ──────────────────────────────────────────────────────────
def test_create_object_bon_travail_genere_numero(db_session):
    edef = get_entity_def("bons-travail")
    mapped = {"titre": "BT test", "type_bt": "entretien"}
    obj = create_object("bons-travail", edef, mapped, db_session)
    assert isinstance(obj, BonTravail)
    assert obj.numero.startswith("BT-ENT-")


def test_create_object_filtre_champs_non_modele(db_session):
    edef = get_entity_def("machines")
    mapped = {"nom": "Convoyeur", "champ_inconnu": "ignoré"}
    obj = create_object("machines", edef, mapped, db_session)
    assert obj.nom == "Convoyeur"
    assert not hasattr(obj, "champ_inconnu") or "champ_inconnu" not in obj.__dict__


def test_create_object_lignes_non_supporte(db_session):
    edef = get_entity_def("lignes")
    with pytest.raises(ValueError, match="pas supporté"):
        create_object("lignes", edef, {}, db_session)


# ─── fetch_rows ─────────────────────────────────────────────────────────────
def test_fetch_rows_machines(db_session):
    _machine(db_session, nom="Convoyeur", code_interne="L315")
    edef = get_entity_def("machines")
    rows = fetch_rows("machines", edef, db_session)
    assert len(rows) == 1
    assert rows[0][0] == "Convoyeur"


def test_fetch_rows_pannes_resout_machine_code(db_session):
    machine = _machine(db_session, code_interne="L315")
    panne = Panne(machine_id=machine.id, titre="Bruit anormal", criticite=3)
    db_session.add(panne)
    db_session.commit()

    edef = get_entity_def("pannes")
    rows = fetch_rows("pannes", edef, db_session)
    columns = [c[0] for c in edef["columns"]]
    machine_code_idx = columns.index("machine_code")
    assert rows[0][machine_code_idx] == "L315"


def test_fetch_rows_lignes_aggrege_par_ligne(db_session):
    _machine(db_session, nom="M1", ligne="Ligne 1", site="Triselec")
    _machine(db_session, nom="M2", ligne="Ligne 1", site="Triselec")
    _machine(db_session, nom="M3", ligne="Ligne 2", site="Triselec")

    edef = get_entity_def("lignes")
    rows = fetch_rows("lignes", edef, db_session)
    by_ligne = {r[0]: r for r in rows}
    assert by_ligne["Ligne 1"][2] == "2"
    assert by_ligne["Ligne 2"][2] == "1"
