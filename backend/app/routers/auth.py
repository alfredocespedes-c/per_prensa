"""Flujo OAuth 2.0 Authorization Code contra el IAM COIPO — patrón BFF.

El navegador NUNCA ve el access_token del IAM: se canjea acá, se usa una sola vez
contra GET /oauth/userinfo y se DESCARTA. Lo único que viaja al navegador es una
cookie httpOnly firmada con SESSION_SECRET.

Estilo síncrono (`def`, no `async def`) igual que routers/noticias.py: FastAPI
despacha los `def` al threadpool de anyio, así que el httpx bloqueante del callback
no bloquea el event loop de los workers.
"""
import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import config, seguridad
from ..db.session import get_db
from ..dependencias import exigir_configuracion
from ..servicios import auditoria, iam

logger = logging.getLogger(__name__)

# Sin sesión requerida: este router ES la puerta. Pero sí exige configuración.
router = APIRouter(prefix="/api/auth", dependencies=[Depends(exigir_configuracion)])

# El callback se expone ADEMÁS en /auth/callback (sin el prefijo /api).
#
# El resto del ecosistema COIPO registró sus aplicaciones con esa ruta, porque en
# COIPO_APPTEST el intercambio del código lo hacía el navegador. Acá lo atiende el
# backend, así que /api/auth/callback sería lo natural — pero obligar a editar el
# registro del IAM en cada despliegue es un paso manual que ya falló, y el modo de
# fallo ("redirect_uri no autorizada") no dice qué hay que corregir.
#
# Aceptando las dos rutas, la aplicación funciona con el registro que exista, y
# IAM_REDIRECT_URI solo tiene que coincidir con él. nginx enruta la ruta sin prefijo
# con un `location = /auth/callback` explícito (ver frontend/nginx.conf).
router_compat = APIRouter(prefix="/auth", dependencies=[Depends(exigir_configuracion)])

RUTA_INICIO = "/"
# HashRouter: la ruta de la SPA va después del '#'. Ver frontend/src/App.jsx.
RUTA_ERROR = "/#/acceso?error="

# Ruta de retorno por defecto: la misma con la que están registradas las demás
# aplicaciones del ecosistema COIPO en el IAM.
RUTA_CALLBACK = "/auth/callback"


def _redirect_uri(request: Request) -> str:
    """URL de retorno que se le declara al IAM.

    Si IAM_REDIRECT_URI está definida, manda (override explícito). Si no, se deduce
    del propio request, que es exactamente lo que hace COIPO_APPTEST en el navegador
    con window.location.origin — solo que acá el retorno lo atiende el backend.

    Deducirla NO es un agujero: el IAM valida la redirect_uri contra su lista
    registrada, así que un Host falsificado no redirige a ninguna parte, falla con
    "redirect_uri no autorizada". Y como se fija en la cookie de state firmada al
    iniciar el login, el canje posterior usa la misma cadena sí o sí.

    El esquema no se puede leer del request: frontend/nginx.conf fija
    X-Forwarded-Proto $scheme, y dentro del contenedor $scheme siempre vale "http"
    aunque el usuario haya entrado por HTTPS. Se usa SESION_HTTPS_ONLY, que ya es la
    declaración explícita de si el sitio se sirve con TLS.
    """
    if config.IAM_REDIRECT_URI:
        return config.IAM_REDIRECT_URI
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    esquema = "https" if config.SESION_HTTPS_ONLY else "http"
    return f"{esquema}://{host}{RUTA_CALLBACK}"


def _destino_seguro(destino: str) -> str:
    """Antirredirección abierta: solo rutas relativas de este mismo sitio."""
    if not destino or not destino.startswith("/") or destino.startswith("//"):
        return RUTA_INICIO
    if any(caracter in destino for caracter in ("\\", "\n", "\r")):
        return RUTA_INICIO
    return destino[:200]


def _redirigir(destino: str) -> RedirectResponse:
    # 303 y no el 307 por defecto de Starlette: es lo semánticamente correcto tras
    # procesar el callback y evita cualquier rareza de método/cuerpo.
    respuesta = RedirectResponse(destino, status_code=status.HTTP_303_SEE_OTHER)
    respuesta.headers["Cache-Control"] = "no-store"
    return respuesta


@router.get("/login")
def login(request: Request, destino: str = RUTA_INICIO) -> RedirectResponse:
    state = seguridad.nuevo_state()
    redirect_uri = _redirect_uri(request)
    parametros = urlencode(
        {
            "client_id": config.IAM_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
        }
    )
    respuesta = _redirigir(f"{config.IAM_URL}/oauth/authorize?{parametros}")
    # La redirect_uri queda congelada en la cookie firmada: el canje del código debe
    # usar una cadena IDÉNTICA a la que se mandó acá.
    seguridad.poner_cookie_estado(
        respuesta, seguridad.firmar_estado(state, _destino_seguro(destino), redirect_uri)
    )
    return respuesta


@router.get("/callback")
@router_compat.get("/callback")
def callback(
    request: Request,
    code: str = "",
    state: str = "",
    db: Session = Depends(get_db),
) -> RedirectResponse:
    ip = auditoria.origen(request)

    verificado = seguridad.verificar_estado(
        request.cookies.get(seguridad.COOKIE_ESTADO, ""), state
    )
    if verificado is None:
        auditoria.registrar(db, "LOGIN_ESTADO_INVALIDO", ip=ip)
        return _con_estado_borrado(_redirigir(RUTA_ERROR + "estado_invalido"))
    destino, redirect_uri = verificado
    if not code:
        auditoria.registrar(db, "LOGIN_SIN_CODIGO", ip=ip)
        return _con_estado_borrado(_redirigir(RUTA_ERROR + "sin_codigo"))

    try:
        # La MISMA cadena que se envió a /authorize, tomada de la cookie firmada.
        token = iam.canjear_codigo(code, redirect_uri or _redirect_uri(request))
        info = iam.obtener_userinfo(token)
    except iam.ErrorIAM as exc:
        auditoria.registrar(db, "LOGIN_IAM_ERROR", ip=ip, detalle={"motivo": exc.motivo})
        return _con_estado_borrado(_redirigir(RUTA_ERROR + exc.motivo))
    # A partir de acá `token` NO se vuelve a usar: no se guarda, no se manda al
    # navegador, no se refresca. ÚNICO punto del backend que depende del IAM.

    # Verificación opcional (ver config.IAM_APP_ID): si está configurada, se comprueba
    # que el token sea de esta aplicación. Con el patrón BFF es redundante —el token lo
    # pedimos nosotros con nuestro client_id/secret y el IAM ata el code a nuestra
    # app—, pero cuesta nada tenerla cuando el id está a mano.
    if config.IAM_APP_ID is not None and int(info.get("app_id") or 0) != config.IAM_APP_ID:
        auditoria.registrar(
            db, "LOGIN_APP_INCORRECTA", ip=ip, usuario=info.get("username"),
            detalle={"app_id_recibido": info.get("app_id")},
        )
        return _con_estado_borrado(_redirigir(RUTA_ERROR + "app_incorrecta"))

    rol = str(info.get("role") or "").strip().lower()
    if rol == "general" and not config.PERMITIR_SIN_ASIGNACION:
        auditoria.registrar(db, "LOGIN_SIN_ASIGNACION", ip=ip, usuario=info.get("username"))
        return _con_estado_borrado(_redirigir(RUTA_ERROR + "sin_asignacion"))

    datos = seguridad.crear_sesion(
        sub=info["sub"], usuario=info.get("username"), email=info.get("email"),
        rol=rol, app_id=int(info["app_id"]),
    )
    auditoria.registrar(
        db, "LOGIN_OK", ip=ip, sub=datos["sub"], usuario=datos["usuario"], rol=rol
    )

    respuesta = _redirigir(f"/#{_destino_seguro(destino)}")
    seguridad.borrar_cookie_estado(respuesta)
    seguridad.poner_cookie_sesion(respuesta, datos)
    return respuesta


def _con_estado_borrado(respuesta: RedirectResponse) -> RedirectResponse:
    """La cookie de state se consume una sola vez, pase lo que pase: si sobrevive a
    un intento fallido, el siguiente reintento la reusaría."""
    seguridad.borrar_cookie_estado(respuesta)
    return respuesta


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    """Cierra la sesión LOCAL.

    El IAM no tiene endpoint de logout y tampoco mantiene sesión propia: cada login
    exige teclear la contraseña de nuevo (ver COIPO_USUARIOS oauth/router.py).
    """
    datos = seguridad.verificar_sesion(request.cookies.get(seguridad.COOKIE_SESION, ""))
    if datos:
        auditoria.registrar(
            db, "LOGOUT", ip=auditoria.origen(request),
            sub=datos.get("sub"), usuario=datos.get("usuario"),
        )
    respuesta = Response(status_code=status.HTTP_204_NO_CONTENT)
    respuesta.headers["Cache-Control"] = "no-store"
    seguridad.borrar_cookie_sesion(respuesta)
    return respuesta
