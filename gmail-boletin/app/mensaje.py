"""Extracción de un correo: metadatos primero, cuerpo solo si hace falta.

DOS FORMATOS, A PROPÓSITO:

  format='metadata' -> cabeceras pedidas y nada más. Es lo que se usa para listar.
  format='full'     -> el árbol MIME completo, o sea el correo entero.

El boletín que motiva esta aplicación pesa cerca de 500 KB. Traer `full` de cada
resultado para acabar imprimiendo una lista de asuntos es gastar cuota y ancho de banda
por nada, y con buzones grandes es la diferencia entre segundos y minutos. Por eso el
recorrido es en dos fases: metadatos de todos, cuerpo solo de los que se van a procesar.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

from .cliente_gmail import ejecutar
from .cuerpo import CuerpoExtraido, extraer_cuerpo

logger = logging.getLogger(__name__)

CABECERAS = ("Date", "From", "To", "Cc", "Subject", "Message-ID")


@dataclass(frozen=True)
class Correo:
    id: str
    hilo_id: str
    fecha: datetime | None
    remitente: str
    destinatario: str
    copia: str
    asunto: str
    resumen: str
    etiquetas: tuple[str, ...]
    cuerpo: CuerpoExtraido | None = None

    @property
    def fecha_texto(self) -> str:
        if self.fecha is None:
            return "(sin fecha)"
        return self.fecha.strftime("%A %d/%m/%Y %H:%M %Z")


def _cabecera(payload: dict, nombre: str) -> str:
    objetivo = nombre.lower()
    for cabecera in (payload or {}).get("headers") or []:
        if (cabecera.get("name") or "").lower() == objetivo:
            return (cabecera.get("value") or "").strip()
    return ""


def _fecha(mensaje: dict, payload: dict, huso: ZoneInfo) -> datetime | None:
    """`internalDate` como fuente principal; la cabecera Date como respaldo.

    `internalDate` son milisegundos de época UTC que pone el servidor de Gmail: siempre
    está, siempre es válida y no depende de que el cliente que envió el correo escribiera
    bien su huso. La cabecera `Date` la redacta el remitente y llega mal con frecuencia,
    así que solo se usa si la otra falta.
    """
    crudo = mensaje.get("internalDate")
    if crudo:
        try:
            return datetime.fromtimestamp(int(crudo) / 1000, tz=timezone.utc).astimezone(huso)
        except (ValueError, OverflowError, OSError):
            pass

    cabecera = _cabecera(payload, "Date")
    if cabecera:
        try:
            fecha = parsedate_to_datetime(cabecera)
            # Una fecha sin huso se asume UTC: inventar el local sería peor.
            if fecha.tzinfo is None:
                fecha = fecha.replace(tzinfo=timezone.utc)
            return fecha.astimezone(huso)
        except (TypeError, ValueError):
            logger.debug("Cabecera Date ilegible en el mensaje %s.", mensaje.get("id"))
    return None


def _a_correo(mensaje: dict, huso: ZoneInfo, cuerpo: CuerpoExtraido | None) -> Correo:
    payload = mensaje.get("payload") or {}
    return Correo(
        id=mensaje.get("id", ""),
        hilo_id=mensaje.get("threadId", ""),
        fecha=_fecha(mensaje, payload, huso),
        remitente=_cabecera(payload, "From"),
        destinatario=_cabecera(payload, "To"),
        copia=_cabecera(payload, "Cc"),
        asunto=_cabecera(payload, "Subject") or "(sin asunto)",
        resumen=(mensaje.get("snippet") or "").strip(),
        etiquetas=tuple(mensaje.get("labelIds") or ()),
        cuerpo=cuerpo,
    )


def obtener_metadatos(servicio, mensaje_id: str, huso: ZoneInfo) -> Correo:
    """Solo cabeceras. Barato: no descarga el cuerpo."""
    peticion = servicio.users().messages().get(
        userId="me",
        id=mensaje_id,
        format="metadata",
        metadataHeaders=list(CABECERAS),
    )
    mensaje = ejecutar(peticion, f"leer los metadatos del mensaje {mensaje_id}")
    return _a_correo(mensaje, huso, cuerpo=None)


def obtener_completo(servicio, mensaje_id: str, huso: ZoneInfo) -> Correo:
    """Correo entero, con el árbol MIME, para poder extraer el cuerpo."""
    peticion = servicio.users().messages().get(userId="me", id=mensaje_id, format="full")
    mensaje = ejecutar(peticion, f"leer el mensaje {mensaje_id}")
    cuerpo = extraer_cuerpo(mensaje.get("payload") or {})
    return _a_correo(mensaje, huso, cuerpo=cuerpo)
