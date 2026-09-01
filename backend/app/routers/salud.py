"""GET /health — chequeo de conectividad + antigüedad de la última colecta. Sirve
como base para una alerta externa si el collector lleva más de ~90 minutos sin correr
(margen de seguridad sobre el cron horario)."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import config
from ..db.models import ColeccionMetadatos
from ..db.session import get_db
from ..schemas import HealthOut

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health", response_model=HealthOut)
def salud(db: Session = Depends(get_db)) -> dict:
    # Se informan los NOMBRES de las variables de autenticación que faltan, nunca el
    # motivo (SEC-07): el detalle ya se registró en el log al arrancar. Deliberadamente
    # se responde 200 y no 503: un 503 dejaría el contenedor unhealthy y, por el
    # depends_on de docker-compose, `app` no arrancaría — un 502 mudo en vez de una
    # pantalla que dice qué falta. El cierre efectivo lo hace la autenticación misma
    # (config.CONFIGURACION_OK), no este endpoint.
    configuracion = config.FALTANTES or None

    try:
        db.execute(text("SELECT 1"))
    except Exception:
        # No se filtra el detalle de la excepción al cliente (host/puerto/usuario/BD):
        # se registra server-side y se responde un estado genérico (SEC-07).
        logger.exception("Fallo de conectividad con la base de datos en /health")
        return {"status": "error", "db": "error", "configuracion": configuracion}

    metadatos = db.get(ColeccionMetadatos, 1)
    ultima_colecta = metadatos.actualizado_en if metadatos else None
    minutos = None
    if ultima_colecta is not None:
        minutos = (datetime.now(timezone.utc) - ultima_colecta).total_seconds() / 60

    return {
        "status": "ok" if configuracion is None else "degradado",
        "db": "ok",
        "ultimaColecta": ultima_colecta,
        "minutosDesdeUltimaColecta": minutos,
        "configuracion": configuracion,
    }
