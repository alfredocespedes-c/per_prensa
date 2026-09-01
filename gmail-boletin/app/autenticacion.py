"""Autenticación: del refresh token al access token, sin navegador y sin estado en disco.

EL PUNTO CENTRAL. El access token de Google dura ~1 hora y NO es un secreto que se
almacene: se deriva en cada arranque a partir de GOOGLE_REFRESH_TOKEN, que es el único
secreto de larga vida. Por eso no hay `token.json` ni volumen para persistirlo — está en
.gitignore precisamente para que nadie lo reintroduzca.

La renovación posterior la hace `google.auth` sola: el objeto Credentials lleva el
refresh_token, y la biblioteca pide un token nuevo en cuanto el actual caduca a mitad de
una corrida larga. Acá solo se fuerza el PRIMER refresco, para fallar rápido y con un
mensaje entendible en vez de reventar en la primera llamada a la API.
"""
import logging

from google.auth.exceptions import RefreshError, TransportError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

from .config import Config
from .errores import ErrorAutenticacion, ErrorRed

logger = logging.getLogger(__name__)

# Solo lectura: la aplicación no puede modificar ni borrar nada del buzón aunque quisiera.
ALCANCES = ("https://www.googleapis.com/auth/gmail.readonly",)
URI_TOKEN = "https://oauth2.googleapis.com/token"


def construir_credenciales(config: Config) -> Credentials:
    """Credenciales listas para usar, con el access token ya obtenido."""
    credenciales = Credentials(
        # token=None a propósito: no hay ninguno guardado, se pide con el refresh token.
        token=None,
        refresh_token=config.refresh_token,
        client_id=config.client_id,
        client_secret=config.client_secret,
        token_uri=URI_TOKEN,
        scopes=list(ALCANCES),
    )

    try:
        credenciales.refresh(Request())
    except RefreshError as error:
        # El mensaje de Google puede traer el cuerpo de la petición; el filtro de
        # registro.py lo redacta, pero además acá se resume en vez de volcarlo entero.
        raise ErrorAutenticacion(
            "Google rechazó GOOGLE_REFRESH_TOKEN. Causas habituales: el token fue "
            "revocado, pertenece a otro CLIENT_ID/CLIENT_SECRET, o se emitió sin el "
            "alcance gmail.readonly. Vuelva a generarlo."
        ) from error
    except TransportError as error:
        raise ErrorRed(
            "No se pudo contactar con el servicio de tokens de Google. Revise la salida "
            "a internet del contenedor y el proxy corporativo."
        ) from error

    # Se registra el HECHO, nunca el valor ni el token.
    logger.info("Access token obtenido a partir del refresh token (caduca en ~1 h).")
    return credenciales
