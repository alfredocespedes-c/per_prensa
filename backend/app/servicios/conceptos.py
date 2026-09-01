"""Reglas de los conceptos — puro, sin I/O. Hermano de servicios/mapeo.py.

Espejo Python de collector/src/dominio/conceptos.js: si cambian las reglas allá,
cambian acá. Son tres implementaciones de la misma normalización (esta, la de JS y la
columna generada `texto_normalizado` de db/schema.sql) y esa es la deuda inevitable
del diseño; se contiene con casos de prueba compartidos.
"""
import re
import unicodedata
from datetime import datetime, timedelta, timezone

LARGO_MIN = 3
LARGO_MAX = 80
MAX_PALABRAS = 8
MAX_ACTIVOS_POR_TIPO = 100

_ESPACIOS = re.compile(r"\s+")
# Rompen la consulta de Google News, que se arma como `"concepto" OR ...`
_COMILLAS = re.compile(r"[\"“”«»]")
_COMBINANTES = re.compile(r"[̀-ͯ]")


def normalizar_concepto(valor: str) -> str:
    """trim + colapsa espacios internos + NFC + valida.

    Lanza ValueError, que Pydantic convierte en 422 con el mensaje visible para el
    admin. NFC es obligatorio: un texto pegado desde Word o macOS llega descompuesto
    ('á' = 'a' + U+0301) y el detector del collector, que indexa por caracteres
    precompuestos, nunca lo matchearía — el concepto rendiría cero noticias sin
    ningún error.
    """
    limpio = _ESPACIOS.sub(" ", unicodedata.normalize("NFC", str(valor or ""))).strip()

    if len(limpio) < LARGO_MIN:
        raise ValueError(f"El concepto debe tener al menos {LARGO_MIN} caracteres visibles.")
    if len(limpio) > LARGO_MAX:
        raise ValueError(f"El concepto no puede superar los {LARGO_MAX} caracteres.")
    if len(limpio.split(" ")) > MAX_PALABRAS:
        raise ValueError(f"El concepto no puede tener más de {MAX_PALABRAS} palabras.")
    if _COMILLAS.search(limpio):
        raise ValueError("El concepto no puede contener comillas.")
    if not any(caracter.isalnum() for caracter in limpio):
        raise ValueError("El concepto debe contener al menos una letra o un número.")
    return limpio


def plegar_concepto(valor: str) -> str:
    """Forma plegada, espejo de conceptos.texto_normalizado (db/schema.sql).

    Sirve para armar el mensaje del 409 sin una ida y vuelta extra a la base.
    """
    limpio = _ESPACIOS.sub(" ", unicodedata.normalize("NFC", str(valor or ""))).strip().lower()
    return _COMBINANTES.sub("", unicodedata.normalize("NFD", limpio))


def proxima_corrida(ahora: datetime) -> datetime:
    """Próximo minuto :00 en UTC.

    El cron del collector es `0 * * * *` (collector/crontab) y su contenedor no fija
    TZ, así que corre en UTC; como Chile tiene offset de horas enteras, :00 UTC es
    :00 en Chile. El frontend lo formatea con timeZone America/Santiago.
    """
    return (ahora + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)


def ahora_utc() -> datetime:
    return datetime.now(timezone.utc)
