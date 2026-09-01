"""Descarga del documento del boletín. El único sitio del servicio que sale a la web.

Todo lo demás habla con Gmail (por la biblioteca de Google) o con Postgres. Acá se pide
UNA página al proveedor, y por eso vale la pena que sea un punto único con sus límites
puestos: host en lista blanca, tamaño máximo y tiempo máximo.

LA LISTA BLANCA SE VUELVE A COMPROBAR AQUÍ aunque la URL ya venga validada del correo.
No es duplicación por descuido: esta función recibe una URL que, en última instancia, vino
de un correo, y una petición HTTP a un destino elegido por un tercero es la definición de
SSRF. La validación en el borde de entrada evita guardar basura; esta evita pedirla.
"""
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from .errores import ErrorRed

logger = logging.getLogger(__name__)

# El boletín del 26-08-2026 pesaba 478 KB. 8 MB deja margen de sobra y acota el daño de
# una respuesta anómala.
MAX_BYTES = 8 * 1024 * 1024
TIMEOUT_S = 30
AGENTE = "COIPO_PRENSA/1.0 (+https://prensa.conaf.cl)"


class DocumentoNoDisponible(Exception):
    """No se pudo traer el documento. No es fatal: el enlace sigue sirviendo."""


def descargar(url: str, hosts_permitidos) -> str:
    """Devuelve el HTML del documento. Lanza DocumentoNoDisponible si no se puede."""
    partes = urlsplit(url or "")
    host = (partes.hostname or "").lower().rstrip(".")
    permitidos = {h.strip().lower().rstrip(".") for h in hosts_permitidos if h and h.strip()}

    if partes.scheme != "https" or host not in permitidos:
        raise DocumentoNoDisponible(f"destino no permitido: {host or '(sin host)'}")

    try:
        with urlopen(Request(url, headers={"User-Agent": AGENTE}), timeout=TIMEOUT_S) as respuesta:
            # +1 para poder detectar que se pasó del tope en vez de truncar en silencio.
            crudo = respuesta.read(MAX_BYTES + 1)
            if len(crudo) > MAX_BYTES:
                raise DocumentoNoDisponible(f"el documento supera los {MAX_BYTES} bytes")
            codificacion = respuesta.headers.get_content_charset() or "utf-8"
    except HTTPError as error:
        raise DocumentoNoDisponible(f"HTTP {error.code} al pedir el documento") from error
    except URLError as error:
        raise ErrorRed(f"No se pudo alcanzar {host}: {error.reason}") from error
    except TimeoutError as error:
        raise ErrorRed(f"Tiempo agotado al pedir el documento a {host}") from error

    # errors='replace': un byte mal codificado no puede costar el boletín entero.
    return crudo.decode(codificacion, errors="replace")
