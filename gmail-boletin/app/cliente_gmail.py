"""Cliente de la Gmail API: construcción del servicio y traducción de errores.

Todo lo que llama a Google pasa por `ejecutar()`. Ese punto único es lo que hace que el
reintento con espera exponencial y la traducción de errores existan de verdad, en vez de
depender de que cada llamada se acuerde de ponerlos.
"""
import logging
import socket

import httplib2
from google.auth.exceptions import GoogleAuthError, RefreshError, TransportError
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .errores import ErrorAutenticacion, ErrorGmail, ErrorRed

logger = logging.getLogger(__name__)

# googleapiclient reintenta solo los errores que se consideran transitorios (429 y 5xx),
# con espera exponencial y jitter. Cinco intentos cubren un pico de cuota sin que una
# corrida desatendida se quede colgada.
REINTENTOS = 5


def construir_servicio(credenciales):
    """Servicio de Gmail v1.

    cache_discovery=False: la caché de descubrimiento escribe en disco y en un contenedor
    de solo lectura falla, además de dejar un aviso en cada arranque.
    """
    try:
        return build("gmail", "v1", credentials=credenciales, cache_discovery=False)
    except (TransportError, socket.timeout, OSError) as error:
        raise ErrorRed(
            "No se pudo descargar el descriptor de la Gmail API. Revise la salida a "
            "internet del contenedor."
        ) from error


def ejecutar(peticion, descripcion: str):
    """Ejecuta una petición ya construida y traduce cualquier fallo a un error propio."""
    try:
        return peticion.execute(num_retries=REINTENTOS)
    except HttpError as error:
        estado = getattr(error.resp, "status", None)
        if estado in (401, 403):
            # 401 = token inválido; 403 puede ser alcance insuficiente o API deshabilitada.
            raise ErrorAutenticacion(
                f"Gmail denegó el acceso al {descripcion} (HTTP {estado}). Compruebe que "
                "el refresh token tenga el alcance gmail.readonly y que la Gmail API esté "
                "habilitada en el proyecto de Google Cloud."
            ) from error
        if estado == 429:
            raise ErrorGmail(
                "Se agotó la cuota de la Gmail API tras varios reintentos. Reduzca "
                "GMAIL_MAX_RESULTADOS o espere unos minutos."
            ) from error
        raise ErrorGmail(f"La Gmail API falló al {descripcion} (HTTP {estado}).") from error
    except RefreshError as error:
        raise ErrorAutenticacion(
            "No se pudo renovar el access token a mitad de la corrida. El refresh token "
            "pudo ser revocado mientras la aplicación se ejecutaba."
        ) from error
    except (TransportError, GoogleAuthError) as error:
        raise ErrorRed(f"Fallo de transporte al {descripcion}.") from error
    except (socket.timeout, TimeoutError, httplib2.HttpLib2Error, OSError) as error:
        raise ErrorRed(f"Fallo de red al {descripcion}.") from error
