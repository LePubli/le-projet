"""Logging structuré JSON via structlog.

Configuration:
  - En production (LOG_FORMAT=json) : logs JSON pour ELK/Loki/Datadog
  - En dev (LOG_FORMAT=console, défaut) : logs colorés lisibles console

Usage:
  from app.core.logging import get_logger
  log = get_logger(__name__)
  log.info("panne_created", panne_id=42, machine="L315", user="admin")
"""

import logging
import sys
import os
import structlog


def configure_logging() -> None:
    """Configure structlog + stdlib logging. À appeler au démarrage de l'app."""
    log_format = os.getenv("LOG_FORMAT", "console").lower()
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    # Configure stdlib logging (structlog s'y branche)
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level, logging.INFO),
    )

    # Shared processors
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if log_format == "json":
        # Production : JSON pour collecteur de logs
        renderer = structlog.processors.JSONRenderer()
    else:
        # Dev : console colorée
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level, logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Retourne un logger structlog bound. À appeler en haut de chaque module."""
    return structlog.get_logger(name)
