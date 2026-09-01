"""Firma de la cookie de estado OAuth y de la cookie de sesión (patrón BFF).

El navegador NUNCA ve el JWT del IAM: el backend lo canjea, lo usa una sola vez
contra /oauth/userinfo y lo descarta. Lo único que sale al navegador es una cookie
httpOnly con payload propio, FIRMADO (no cifrado) con SESSION_SECRET.

Firmado y no cifrado a propósito: el contenido (usuario, correo, rol) es información
que ese mismo usuario ya ve en pantalla; lo que hay que impedir es que la MODIFIQUE
—subirse el rol a "admin"— y para eso basta el HMAC.

Sin estado en memoria: backend/Dockerfile arranca `uvicorn --workers 2`, así que un
set() de states o un dict de sesiones en RAM acertaría la mitad de las veces. Cookie
firmada = stateless = correcto con N workers.
"""
import hashlib
import secrets
import time

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from . import config

COOKIE_SESION = "coipo_prensa_sesion"
COOKIE_ESTADO = "coipo_prensa_estado"

# Path "/" y no "/api/auth": el callback se atiende en DOS rutas
# (/api/auth/callback y /auth/callback, ver routers/auth.py), y una cookie acotada a
# /api/auth no viajaría a la segunda — el login fallaría siempre con "estado_invalido"
# y sin ninguna pista de por qué. El costo de mandarla en otras peticiones es
# despreciable: vive 10 minutos y se borra en cuanto se consume.
RUTA_COOKIE_ESTADO = "/"

# El authorization code del IAM dura 5 min (oauth_service._CODE_TTL_MINUTES); 10
# minutos da margen para que un humano teclee usuario y clave en el HTML del IAM.
TTL_ESTADO_SEGUNDOS = 600

# Subir este número invalida todas las sesiones abiertas, a propósito.
VERSION_SESION = 1

# Placeholder DETERMINISTA, no aleatorio: con --workers 2 un secreto aleatorio por
# proceso daría fallos intermitentes imposibles de diagnosticar. Nunca llega a ser
# usable porque config.CONFIGURACION_OK es False mientras falte SESSION_SECRET, y
# tanto el login como la verificación de sesión fallan cerrado en ese caso.
_SECRETO = config.SESSION_SECRET or "COIPO_PRENSA_SIN_SECRETO_CONFIGURADO"
_FIRMA = {"digest_method": hashlib.sha256}

_estado = URLSafeTimedSerializer(_SECRETO, salt="coipo-prensa-oauth-state", signer_kwargs=_FIRMA)
_sesion = URLSafeTimedSerializer(_SECRETO, salt="coipo-prensa-sesion", signer_kwargs=_FIRMA)


# ── state anti-CSRF del flujo OAuth ───────────────────────────────────────────

def nuevo_state() -> str:
    return secrets.token_urlsafe(32)


def firmar_estado(state: str, destino: str, redirect_uri: str) -> str:
    """El destino post-login y la redirect_uri viajan FIRMADOS junto al state.

    El destino va acá y no por la URL porque el IAM no reenvía parámetros propios, y
    aceptarlo del query string abriría una redirección abierta.

    La redirect_uri va acá porque el IAM exige que la del canje sea IDÉNTICA a la del
    /authorize. Al fijarla en la cookie firmada cuando se inicia el login, el canje usa
    exactamente la misma cadena aunque se haya deducido del request — y nadie puede
    alterarla, porque el HMAC la protege.
    """
    return _estado.dumps({"s": state, "d": destino, "r": redirect_uri})


def verificar_estado(cookie: str, state_recibido: str) -> tuple[str, str] | None:
    """Devuelve (destino, redirect_uri) si el state calza; None si no.

    Doble expiración: la del navegador (max_age de la cookie) y la del servidor
    (max_age de loads()). Nunca confiar solo en la primera.
    """
    if not cookie or not state_recibido:
        return None
    try:
        datos = _estado.loads(cookie, max_age=TTL_ESTADO_SEGUNDOS)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(datos, dict):
        return None
    if not secrets.compare_digest(str(datos.get("s", "")), state_recibido):
        return None
    return str(datos.get("d") or "/"), str(datos.get("r") or "")


# ── sesión propia ─────────────────────────────────────────────────────────────

def crear_sesion(*, sub, usuario, email, rol, app_id) -> dict:
    ahora = int(time.time())
    tope = ahora + config.SESION_ABSOLUTA_SEGUNDOS
    if config.SESION_JITTER_SEGUNDOS > 0:
        # Sin jitter, todas las sesiones creadas el día del despliegue vencen el
        # MISMO día; si ese día el IAM está caído, nadie entra a las 8:00.
        tope += secrets.randbelow(config.SESION_JITTER_SEGUNDOS + 1)
    return {
        "v": VERSION_SESION,
        "sub": str(sub),
        "usuario": usuario or "",
        "email": email or "",
        "rol": (rol or "").strip().lower(),
        "app_id": int(app_id),
        "iniciada_en": ahora,
        "expira_en": tope,
        "renovada_en": ahora,
    }


def verificar_sesion(cookie: str) -> dict | None:
    """Solo HMAC + reloj. NO consulta al IAM ni a Postgres.

    Es lo que hace que una caída del IAM (o un parpadeo de la base de datos) no
    expulse a nadie que ya tenga sesión — el requisito de las 8:00.
    """
    # Fallo cerrado si la autenticación no está configurada: sin esto, el
    # placeholder determinista de arriba —que está publicado en un repo público—
    # permitiría a cualquiera firmarse una cookie con rol admin.
    if not config.CONFIGURACION_OK or not cookie:
        return None
    try:
        # max_age es la ventana DESLIZANTE: mide contra el timestamp de la última
        # re-emisión, no contra el login original.
        datos = _sesion.loads(cookie, max_age=config.SESION_INACTIVIDAD_SEGUNDOS)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(datos, dict) or datos.get("v") != VERSION_SESION:
        return None
    if int(datos.get("expira_en", 0)) <= int(time.time()):  # tope ABSOLUTO
        return None
    return datos


def debe_renovarse(datos: dict) -> bool:
    return int(time.time()) - int(datos.get("renovada_en", 0)) >= config.SESION_RENOVAR_CADA_SEGUNDOS


# ── cookies ───────────────────────────────────────────────────────────────────

def poner_cookie_sesion(respuesta, datos: dict) -> None:
    datos = {**datos, "renovada_en": int(time.time())}
    respuesta.set_cookie(
        COOKIE_SESION,
        _sesion.dumps(datos),
        max_age=config.SESION_INACTIVIDAD_SEGUNDOS,
        httponly=True,
        secure=config.SESION_HTTPS_ONLY,
        # 'lax' y no 'strict': en desarrollo el origen es localhost:5173 y el IAM es
        # iam.conaf.cl — ahí SÍ son cross-site y con 'strict' la cookie no viajaría
        # en el 302 de vuelta. (En producción ambos cuelgan de conaf.cl y son
        # same-site, así que 'strict' "funcionaría" — no dejarse engañar por eso.)
        samesite="lax",
        # Sin Domain: cookie host-only. JAMÁS .conaf.cl, que la compartiría con
        # todas las demás apps del dominio.
        path="/",
    )


def poner_cookie_estado(respuesta, firmado: str) -> None:
    respuesta.set_cookie(
        COOKIE_ESTADO,
        firmado,
        max_age=TTL_ESTADO_SEGUNDOS,
        httponly=True,
        secure=config.SESION_HTTPS_ONLY,
        samesite="lax",
        path=RUTA_COOKIE_ESTADO,
    )


def borrar_cookie_sesion(respuesta) -> None:
    respuesta.delete_cookie(
        COOKIE_SESION, path="/", httponly=True,
        secure=config.SESION_HTTPS_ONLY, samesite="lax",
    )


def borrar_cookie_estado(respuesta) -> None:
    respuesta.delete_cookie(
        COOKIE_ESTADO, path=RUTA_COOKIE_ESTADO, httponly=True,
        secure=config.SESION_HTTPS_ONLY, samesite="lax",
    )


def cabecera_borrar_sesion() -> str:
    """Set-Cookie de borrado como STRING, para usar en headers de HTTPException.

    Necesario porque cuando una dependencia lanza HTTPException, FastAPI arma una
    JSONResponse nueva y DESCARTA el `Response` inyectado en la dependencia: un
    delete_cookie() ahí no llegaría nunca al navegador. Los headers de la
    HTTPException sí se propagan.
    """
    partes = [f"{COOKIE_SESION}=", "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"]
    if config.SESION_HTTPS_ONLY:
        partes.append("Secure")
    return "; ".join(partes)
