"""Cliente HTTP del IAM COIPO (repo COIPO_USUARIOS).

ÚNICO módulo del backend que habla con el IAM, y solo se usa dentro de
GET /api/auth/callback. Esa concentración es deliberada y es lo que sostiene el
requisito de SECOM de que la página esté arriba a las 8:00: fuera del callback,
ninguna petición depende de que el IAM responda.
"""
import logging

import httpx

from .. import config

logger = logging.getLogger(__name__)


class ErrorIAM(Exception):
    """Motivo corto y seguro de mostrar en una URL (?error=...)."""

    def __init__(self, motivo: str):
        super().__init__(motivo)
        self.motivo = motivo


def _describir(exc: BaseException) -> str:
    """Descripción útil de una excepción de httpx.

    Varias (ConnectError, ConnectTimeout) traen str() VACÍO: toda la información
    está en el tipo y en la causa encadenada. Loguear solo str(exc) deja una línea
    que no dice nada — ya pasó en producción en COIPO_APPTEST.
    """
    partes, actual, vistas = [], exc, 0
    while actual is not None and vistas < 4:
        mensaje = str(actual).strip()
        partes.append(f"{type(actual).__name__}: {mensaje}" if mensaje else type(actual).__name__)
        actual = actual.__cause__ or actual.__context__
        vistas += 1
    return " <- ".join(partes)


def _cliente() -> httpx.Client:
    # Timeouts granulares y CORTOS: un IAM colgado no puede quedarse con un hilo del
    # threadpool indefinidamente. Los endpoints son `def` (no `async def`), así que
    # FastAPI los despacha al threadpool de anyio y este httpx bloqueante no frena el
    # event loop de los workers.
    return httpx.Client(
        timeout=httpx.Timeout(
            connect=5.0, read=config.IAM_TIMEOUT_SEGUNDOS, write=5.0, pool=5.0
        ),
        follow_redirects=False,
    )


def canjear_codigo(code: str, redirect_uri: str) -> str:
    """POST /oauth/token, server-to-server. El CLIENT_SECRET nunca sale de acá.

    `redirect_uri` viene de la cookie de state firmada (ver routers/auth.py): el IAM
    exige que sea idéntica a la enviada a /authorize.
    """
    try:
        with _cliente() as cliente:
            respuesta = cliente.post(
                f"{config.IAM_URL}/oauth/token",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": config.IAM_CLIENT_ID,
                    "client_secret": config.IAM_CLIENT_SECRET,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as exc:
        logger.error("IAM inalcanzable en %s/oauth/token — %s", config.IAM_URL, _describir(exc))
        raise ErrorIAM("iam_inalcanzable") from exc

    if respuesta.status_code != 200:
        # NUNCA reenviar el body del IAM: sus bloques `except` devuelven HTML con
        # traceback de Python (COIPO_USUARIOS/backend/oauth/router.py).
        logger.warning("El IAM rechazó el canje del código (HTTP %s)", respuesta.status_code)
        raise ErrorIAM("codigo_invalido")

    try:
        datos = respuesta.json()
    except ValueError as exc:
        raise ErrorIAM("respuesta_invalida") from exc

    token = datos.get("access_token")
    if not isinstance(token, str) or not token:
        logger.error("Respuesta del IAM sin access_token")
        raise ErrorIAM("respuesta_invalida")
    return token


def obtener_userinfo(token: str) -> dict:
    """GET /oauth/userinfo -> {sub, username, email, role, app_id}.

    Es la validación del token SIN tener el JWT_SECRET compartido del ecosistema.
    Se paga UNA vez, en el callback: después la sesión es propia y el IAM no se
    vuelve a consultar nunca.
    """
    try:
        with _cliente() as cliente:
            respuesta = cliente.get(
                f"{config.IAM_URL}/oauth/userinfo",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.RequestError as exc:
        logger.error("IAM inalcanzable en %s/oauth/userinfo — %s", config.IAM_URL, _describir(exc))
        raise ErrorIAM("iam_inalcanzable") from exc

    if respuesta.status_code != 200:
        logger.warning("El IAM rechazó el token en /oauth/userinfo (HTTP %s)", respuesta.status_code)
        raise ErrorIAM("token_invalido")

    try:
        info = respuesta.json()
    except ValueError as exc:
        raise ErrorIAM("respuesta_invalida") from exc

    if not isinstance(info, dict) or not info.get("sub"):
        raise ErrorIAM("respuesta_invalida")
    return info
