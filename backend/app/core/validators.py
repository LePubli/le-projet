def validate_machine_or_convoyeur(machine_id: int | None, convoyeur_id: int | None) -> None:
    """Un équipement ciblé (Panne, Intervention, MaintenancePreventive) référence
    exactement une Machine ou un Convoyeur, jamais les deux, jamais aucun."""
    if (machine_id is None) == (convoyeur_id is None):
        raise ValueError("Fournir exactement un des deux : machine_id ou convoyeur_id")
