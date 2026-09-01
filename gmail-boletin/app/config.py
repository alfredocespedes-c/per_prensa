"""Configuración: TODO lo que la aplicación lee del entorno, en un solo sitio.

Ningún otro módulo llama a os.environ. Así, para saber qué necesita el contenedor basta
leer este archivo, y no hay una variable escondida en medio del código que solo aparezca
cuando falla en producción.

Los secretos se leen acá y NO se imprimen nunca: los mensajes de error nombran la
VARIABLE que falta, jamás su valor.
"""
import os
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .errores import ConfiguracionInvalida

QUERY_POR_DEFECTO = 'subject:"Boletín SECOM CONAF"'
ZONA_POR_DEFECTO = "America/Santiago"
HOSTS_POR_DEFECTO = "mediastation.simbiu.es"
REMITENTES_POR_DEFECTO = "noticias@conaf.cl"

_OBLIGATORIAS = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN")


def _texto(nombre: str, por_defecto: str = "") -> str:
    return (os.environ.get(nombre) or por_defecto).strip()


def _lista(nombre: str, por_defecto: str) -> tuple[str, ...]:
    crudo = _texto(nombre, por_defecto)
    return tuple(x.strip().lower() for x in crudo.split(",") if x.strip())


def _entero(nombre: str, por_defecto: int, minimo: int = 0) -> int:
    crudo = _texto(nombre)
    if not crudo:
        return por_defecto
    try:
        valor = int(crudo)
    except ValueError as error:
        raise ConfiguracionInvalida(
            f"{nombre} debe ser un número entero (se recibió algo que no lo es)."
        ) from error
    if valor < minimo:
        raise ConfiguracionInvalida(f"{nombre} no puede ser menor que {minimo}.")
    return valor


def _booleano(nombre: str, por_defecto: bool) -> bool:
    crudo = _texto(nombre).lower()
    if not crudo:
        return por_defecto
    if crudo in ("1", "true", "si", "sí", "yes", "on"):
        return True
    if crudo in ("0", "false", "no", "off"):
        return False
    raise ConfiguracionInvalida(f"{nombre} debe ser true o false.")


def _franja(nombre: str) -> tuple[int, int] | None:
    """'7-13' -> (7, 13). Vacío = sin restricción horaria."""
    crudo = _texto(nombre)
    if not crudo:
        return None
    partes = crudo.split("-")
    try:
        inicio, fin = int(partes[0]), int(partes[1])
    except (IndexError, ValueError) as error:
        raise ConfiguracionInvalida(
            f"{nombre} debe tener la forma 'HH-HH' (por ejemplo 7-13)."
        ) from error
    if not (0 <= inicio <= 23 and 0 <= fin <= 23) or inicio > fin:
        raise ConfiguracionInvalida(f"{nombre}: horas fuera de rango o invertidas.")
    return inicio, fin


@dataclass(frozen=True)
class Config:
    # --- Credenciales. Nunca se imprimen: repr=False. ---
    client_id: str = field(repr=False)
    client_secret: str = field(repr=False)
    refresh_token: str = field(repr=False)

    # --- Búsqueda y filtros ---
    query: str
    max_resultados: int  # 0 = todos los que haya, paginando
    remitentes_permitidos: tuple[str, ...]
    hosts_permitidos: tuple[str, ...]

    # --- Salida por consola ---
    incluir_cuerpo: bool
    largo_cuerpo: int  # 0 = completo

    # --- Ingesta en Postgres ---
    postgres: dict = field(repr=False)
    ingesta_activa: bool

    # --- Ejecución ---
    intervalo_segundos: int  # 0 = una pasada y salir
    horas_activas: tuple[int, int] | None
    zona: str
    nivel_log: str

    @property
    def huso(self) -> ZoneInfo:
        return ZoneInfo(self.zona)


def cargar() -> Config:
    """Lee y valida el entorno. Lanza ConfiguracionInvalida con los NOMBRES que faltan."""
    faltan = [nombre for nombre in _OBLIGATORIAS if not _texto(nombre)]
    if faltan:
        raise ConfiguracionInvalida(
            "Faltan variables de entorno obligatorias: "
            + ", ".join(faltan)
            + ". Copie .env.example a .env y rellénelas."
        )

    zona = _texto("TZ", ZONA_POR_DEFECTO)
    try:
        ZoneInfo(zona)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ConfiguracionInvalida(
            f"TZ='{zona}' no es una zona horaria IANA válida (por ejemplo: {ZONA_POR_DEFECTO})."
        ) from error

    # Misma convención que collector/src/config/parametros.js (POSTGRES_ACTIVO): la
    # ingesta se activa por PRESENCIA del host, no por una bandera aparte que se pueda
    # quedar desincronizada de si hay base o no.
    host_bd = _texto("DATABASE_HOST")
    ingesta = _booleano("BOLETIN_INGESTA", bool(host_bd))
    if ingesta and not host_bd:
        raise ConfiguracionInvalida(
            "BOLETIN_INGESTA está activa pero falta DATABASE_HOST. Defina la conexión a "
            "Postgres o ponga BOLETIN_INGESTA=false para solo listar por consola."
        )

    return Config(
        client_id=_texto("GOOGLE_CLIENT_ID"),
        client_secret=_texto("GOOGLE_CLIENT_SECRET"),
        refresh_token=_texto("GOOGLE_REFRESH_TOKEN"),
        query=_texto("GMAIL_QUERY", QUERY_POR_DEFECTO),
        max_resultados=_entero("GMAIL_MAX_RESULTADOS", 20),
        remitentes_permitidos=_lista("BOLETIN_REMITENTES_PERMITIDOS", REMITENTES_POR_DEFECTO),
        hosts_permitidos=_lista("BOLETIN_HOSTS_PERMITIDOS", HOSTS_POR_DEFECTO),
        incluir_cuerpo=_booleano("GMAIL_INCLUIR_CUERPO", True),
        largo_cuerpo=_entero("GMAIL_LARGO_CUERPO", 0),
        postgres={
            "host": host_bd,
            "port": _entero("DATABASE_PORT", 5432),
            "dbname": _texto("DATABASE_NAME"),
            "user": _texto("DATABASE_USER"),
            "password": os.environ.get("DATABASE_PASSWORD") or "",
            "connect_timeout": 10,
        },
        ingesta_activa=ingesta,
        intervalo_segundos=_entero("GMAIL_INTERVALO_SEGUNDOS", 0),
        horas_activas=_franja("BOLETIN_HORAS_ACTIVAS"),
        zona=zona,
        nivel_log=_texto("LOG_LEVEL", "INFO").upper(),
    )
