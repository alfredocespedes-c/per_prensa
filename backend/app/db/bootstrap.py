"""Bootstrap idempotente del esquema.

db/schema.sql (raíz del repo) es la ÚNICA fuente de verdad del DDL — ejecutado tal
cual, tanto aquí como en collector/src/adaptadores/archivador-postgres.js (Node). No
agregar Base.metadata.create_all() en ningún lado (ver db/models.py): si alguna vez
difieren, el .sql es lo que realmente corre contra Postgres.

No lanza si falla: se loguea y la app sigue viva — /health reflejará el problema en
vez de dejar el contenedor en crash-loop por un problema transitorio de red hacia el
servidor compartido.
"""
import logging
import os
from pathlib import Path

from sqlalchemy import Engine

logger = logging.getLogger(__name__)

# Debe coincidir con la constante documentada en el header de db/schema.sql y con
# collector/src/adaptadores/archivador-postgres.js.
CANDADO_ESQUEMA = 487200917

# backend/app/db/bootstrap.py -> parents[3] es la raíz del repo (mismo layout
# relativo dentro y fuera de Docker, ver backend/Dockerfile).
RUTA_ESQUEMA_POR_DEFECTO = Path(__file__).resolve().parents[3] / "db" / "schema.sql"


def _ruta_esquema() -> Path:
    override = os.getenv("SCHEMA_SQL_PATH")
    return Path(override) if override else RUTA_ESQUEMA_POR_DEFECTO


def ensure_schema(engine: Engine) -> None:
    ruta = _ruta_esquema()
    try:
        sql = ruta.read_text(encoding="utf-8")
        with engine.connect() as connection:
            connection.exec_driver_sql(f"SELECT pg_advisory_lock({CANDADO_ESQUEMA})")
            try:
                # Sin parámetros: psycopg2 admite varias sentencias `;`-separadas
                # en una sola llamada (protocolo simple).
                connection.exec_driver_sql(sql)
                connection.commit()
            finally:
                connection.exec_driver_sql(f"SELECT pg_advisory_unlock({CANDADO_ESQUEMA})")
        logger.info("Esquema de Postgres verificado/creado (%s)", ruta)
    except Exception:
        logger.exception("No se pudo verificar/crear el esquema de Postgres al arrancar")
