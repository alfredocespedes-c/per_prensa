"""Traza de autenticación y de cambios de configuración (conceptos).

BEST-EFFORT A PROPÓSITO: si la escritura falla (base compartida caída o lenta), se
loguea y se sigue. Un login que falla porque no se pudo escribir la auditoría
convertiría un parpadeo de Postgres en "nadie entra a las 8:00", uno de los cuatro
errores declarados inaceptables por SECOM.
"""
import json
import logging
from typing import Optional

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_INSERT = text(
    """
    INSERT INTO auditoria (evento, usuario_sub, usuario, rol, ip_origen,
                           objeto, objeto_id, detalle)
    VALUES (:evento, :sub, :usuario, :rol, :ip, :objeto, :objeto_id, CAST(:detalle AS jsonb))
    """
)


def origen(request: Request) -> str:
    """Cadena de proxies tal cual, SIN parsear.

    Hay hasta 3 saltos (proxy corporativo -> nginx del host -> nginx del contenedor
    `app`) y cada uno agrega su IP. Elegir "la" IP del cliente con aritmética de
    saltos es frágil; para auditoría sirve más la cadena completa. Por eso la
    columna es TEXT y no INET: con INET, un valor inesperado abortaría el INSERT.
    """
    cadena = request.headers.get("X-Forwarded-For", "")
    directo = request.client.host if request.client else ""
    return (f"{cadena} <- {directo}" if cadena else directo)[:200]


def registrar(
    db: Session,
    evento: str,
    *,
    ip: str = "",
    sub: Optional[str] = None,
    usuario: Optional[str] = None,
    rol: Optional[str] = None,
    objeto: Optional[str] = None,
    objeto_id: Optional[str] = None,
    detalle: Optional[dict] = None,
) -> None:
    try:
        db.execute(
            _INSERT,
            {
                "evento": evento,
                "sub": sub,
                "usuario": usuario,
                "rol": rol,
                "ip": ip,
                "objeto": objeto,
                "objeto_id": objeto_id,
                "detalle": json.dumps(detalle or {}, ensure_ascii=False),
            },
        )
        db.commit()
    except Exception:
        # El rollback es obligatorio: sin él la Session queda en transacción
        # abortada y cualquier consulta posterior con la misma sesión falla.
        db.rollback()
        logger.exception("No se pudo registrar el evento de auditoría %s", evento)
