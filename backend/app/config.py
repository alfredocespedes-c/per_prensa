"""Configuración vía variables de entorno — sigue el patrón de
fastapi-postgresql-conexion.md (el documento de referencia del proyecto).
"""
import os

from dotenv import load_dotenv

load_dotenv()


def _leer(nombre: str, defecto: str = "") -> str:
    """Ausente y vacía se tratan IGUAL: como faltante.

    Patrón tomado de COIPO_APPTEST/backend/app/config.py. Una variable declarada
    pero vacía en el .env es el modo de fallo más común del despliegue y el más
    difícil de ver a simple vista.

    Se descarta un comentario al final de la línea (` # ...`). docker-compose lo hace
    al leer env_file, pero no todas las versiones ni todos los caminos de carga: sin
    esto, `SESION_HTTPS_ONLY=false  # comentario` se leería como el literal
    "false  # comentario" y _leer_bool lo tomaría como VERDADERO, invirtiendo en
    silencio justo la variable que decide si la cookie lleva Secure.
    """
    crudo = os.getenv(nombre, defecto)
    if " #" in crudo:
        crudo = crudo.split(" #", 1)[0]
    return crudo.strip()


def _leer_bool(nombre: str, defecto: str) -> bool:
    # Vacía se trata como ausente y cae al default, igual que _leer: así
    # `SESION_HTTPS_ONLY=` toma su default (false) y `PERMITIR_SIN_ASIGNACION=` el suyo
    # (true), sin que un valor vacío invierta la intención de la variable.
    valor = _leer(nombre) or defecto
    return valor.lower() not in ("0", "false", "no")


def _leer_int(nombre: str, defecto: str) -> int:
    crudo = _leer(nombre, defecto) or defecto
    try:
        return int(crudo)
    except ValueError:
        return int(defecto)


def _leer_alguna(*nombres: str) -> str:
    """Primera variable no vacía de la lista.

    Existe porque el resto del ecosistema COIPO (ver COIPO_APPTEST/.env.example) usa
    CLIENT_ID / CLIENT_SECRET sin prefijo. Acá se prefiere IAM_* para que quede claro
    de qué cliente OAuth se habla, pero se aceptan ambos: copiar el .env de otra app
    CONAF tiene que funcionar, no fallar con una pantalla de "no configurado".
    """
    for nombre in nombres:
        valor = _leer(nombre)
        if valor:
            return valor
    return ""


# ── Base de datos ─────────────────────────────────────────────────────────────
DATABASE_HOST = os.getenv("DATABASE_HOST", "localhost")
DATABASE_PORT = os.getenv("DATABASE_PORT", "5432")
DATABASE_USER = os.getenv("DATABASE_USER")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD")
DATABASE_NAME = os.getenv("DATABASE_NAME")

DATABASE_URL = (
    f"postgresql://{DATABASE_USER}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_NAME}"
)

# Mirror de collector/src/config/parametros.js TAMANO_VENTANA. Única duplicación
# deliberada de este pivote (un entero, no un esquema) — ver plan de arquitectura.
TAMANO_VENTANA = int(os.getenv("TAMANO_VENTANA", "1000"))

# ── Ambiente ──────────────────────────────────────────────────────────────────
APP_ENV = _leer("APP_ENV", "production") or "production"
ES_PRODUCCION = APP_ENV == "production"

# ── IAM COIPO (servidor de identidad, repo COIPO_USUARIOS) ────────────────────
IAM_URL = _leer("IAM_URL").rstrip("/")
# Se acepta CLIENT_ID/CLIENT_SECRET además de IAM_*: es la convención del resto del
# ecosistema COIPO y copiar el .env de otra app CONAF debe funcionar.
IAM_CLIENT_ID = _leer_alguna("IAM_CLIENT_ID", "CLIENT_ID")
IAM_CLIENT_SECRET = _leer_alguna("IAM_CLIENT_SECRET", "CLIENT_SECRET")
# OPCIONAL. Si se define, se usa tal cual (override explícito). Si no, se deduce del
# request —igual que COIPO_APPTEST la arma en el navegador con window.location.origin—
# usando la ruta /auth/callback. Ver routers/auth.py::_redirect_uri.
IAM_REDIRECT_URI = _leer("IAM_REDIRECT_URI")
IAM_TIMEOUT_SEGUNDOS = float(_leer("IAM_TIMEOUT_SEGUNDOS", "10") or "10")

# OPCIONAL — defensa en profundidad, no control indispensable.
#
# El JWT del IAM no trae claim `aud`, así que en una app que ACEPTA tokens del cliente
# (el patrón de COIPO_APPTEST) comparar app_id es la única defensa contra un token
# emitido para otra app CONAF. Acá NO aplica: con el patrón BFF el token lo obtenemos
# nosotros, con nuestro client_id y client_secret, y el IAM ata el authorization code a
# nuestra aplicación (exchange_code filtra por application_id). El navegador nunca nos
# entrega un token. Por eso, si no está definido, se registra una advertencia y se
# sigue, en vez de impedir el despliegue por una comprobación redundante.
_iam_app_id = _leer("IAM_APP_ID")
IAM_APP_ID = int(_iam_app_id) if _iam_app_id.isdigit() else None

# NO existe IAM_JWT_SECRET a propósito: el JWT_SECRET HS256 es COMPARTIDO por todo el
# ecosistema COIPO; tenerlo acá permitiría falsificar tokens de cualquier usuario en
# cualquier app CONAF. La validación se hace llamando GET /oauth/userinfo, una sola
# vez, en el callback.

# ── Sesión propia (patrón BFF) ────────────────────────────────────────────────
# Si no se define, se DERIVA del CLIENT_SECRET, que ya es un secreto de alta entropía
# (token_urlsafe(32) del IAM) y ya está presente en el .env de toda app CONAF. Así el
# despliegue no se bloquea por una variable más que llenar.
#
# La derivación usa HKDF-SHA256 con un salt propio: la clave de sesión NO es el
# client_secret, y conocer una no permite obtener la otra. Consecuencia a saber: rotar
# el CLIENT_SECRET en el IAM cierra todas las sesiones abiertas.
#
# Definir SESSION_SECRET explícitamente sigue siendo lo preferible (claves distintas
# para propósitos distintos) y tiene precedencia.
_SESSION_SECRET_EXPLICITO = _leer("SESSION_SECRET")


def _derivar_secreto_de_sesion(base: str) -> str:
    import hashlib
    return hashlib.pbkdf2_hmac(
        "sha256", base.encode("utf-8"), b"coipo-prensa-sesion-v1", 100_000
    ).hex()


SESSION_SECRET = _SESSION_SECRET_EXPLICITO or (
    _derivar_secreto_de_sesion(IAM_CLIENT_SECRET) if IAM_CLIENT_SECRET else ""
)

# Ventana DESLIZANTE de inactividad (7 d por defecto). Es la pieza que sostiene el
# requisito de SECOM de que la página esté arriba a las 8:00: el IAM se consulta solo
# en el callback, así que quien usó la app en la última semana entra aunque el IAM
# esté caído. Un TTL de 8-12 h obligaría a pasar por el IAM casi todas las mañanas.
SESION_INACTIVIDAD_SEGUNDOS = _leer_int("SESION_INACTIVIDAD_SEGUNDOS", "604800")
# Tope ABSOLUTO (30 d): obliga a revalidar contra el IAM una vez al mes.
SESION_ABSOLUTA_SEGUNDOS = _leer_int("SESION_ABSOLUTA_SEGUNDOS", "2592000")
# Dispersión aleatoria del tope absoluto (hasta 3 d). Sin esto, todas las sesiones
# creadas el día del despliegue vencen el MISMO día; si ese día el IAM está caído,
# nadie entra a las 8:00.
SESION_JITTER_SEGUNDOS = _leer_int("SESION_JITTER_SEGUNDOS", "259200")
SESION_RENOVAR_CADA_SEGUNDOS = _leer_int("SESION_RENOVAR_CADA_SEGUNDOS", "3600")
# NO se deduce del request: frontend/nginx.conf fija X-Forwarded-Proto $scheme y
# dentro del contenedor $scheme vale siempre "http", aunque el usuario venga por
# HTTPS. Si se pone true y el sitio se sirve por HTTP plano, el navegador descarta la
# cookie EN SILENCIO y el login no completa nunca.
SESION_HTTPS_ONLY = _leer_bool("SESION_HTTPS_ONLY", "false")

# El nombre del rol es texto libre que teclea un admin del IAM, por eso se acepta una
# lista y se compara en minúsculas. Cualquier rol fuera de acá —incluido "general",
# que es lo que el IAM devuelve a quien NO tiene asignación en esta app— queda en
# solo lectura.
ROLES_ADMIN = frozenset(
    rol.strip().lower() for rol in (_leer("ROLES_ADMIN", "admin") or "admin").split(",") if rol.strip()
)
# true  = un usuario del IAM sin asignación en esta app entra en solo lectura.
# false = no entra (comportamiento de COIPO_APPTEST/PLAN_BACKEND_IAM.md).
PERMITIR_SIN_ASIGNACION = _leer_bool("PERMITIR_SIN_ASIGNACION", "true")

# Origen del sitio, para rechazar escrituras cross-site. Defensa en profundidad sobre
# SameSite=Lax. Vacío = sin verificación (desarrollo).
ORIGENES_PERMITIDOS = frozenset(
    origen.strip().rstrip("/") for origen in _leer("ORIGENES_PERMITIDOS").split(",") if origen.strip()
)

# Hosts aceptados como origen del boletín del servicio contratado (ver
# servicios/boletin_contratado.py). Existe para poder reaccionar a un cambio de dominio
# del proveedor SIN desplegar; vacío = se usa la lista por defecto del servicio.
#
# El valor "*" se descarta a propósito: una lista blanca configurable por entorno es
# exactamente el sitio donde alguien pone un comodín "para salir del paso", y a partir de
# ahí la validación deja de existir en silencio. Si el dominio cambia de verdad, se
# escribe el nuevo host, no un asterisco.
BOLETIN_HOSTS_PERMITIDOS = frozenset(
    host.strip().lower().rstrip(".")
    for host in _leer("BOLETIN_HOSTS_PERMITIDOS").split(",")
    if host.strip() and host.strip() != "*"
)

# ── Validación de la configuración ────────────────────────────────────────────
_SECRETOS_PROHIBIDOS = {
    "cambiar", "cambiame", "changeme", "secret", "password", "coipo",
    "generar-con-openssl-rand-hex-32",
}


def _secreto_debil(valor: str) -> bool:
    # len(set(...)) < 8 ataja los "aaaaaaa..." y "12341234..." que pasan el largo.
    return len(valor) < 32 or valor.lower() in _SECRETOS_PROHIBIDOS or len(set(valor)) < 8


def _evaluar_configuracion() -> tuple[list[str], list[str], list[str]]:
    """(nombres_faltantes, problemas_detallados, advertencias).

    Se separan los NOMBRES del DETALLE a propósito: /health es público y expone solo
    los nombres; el motivo ("SESSION_SECRET débil") va únicamente al log (SEC-07).
    """
    faltan: list[str] = []
    problemas: list[str] = []
    avisos: list[str] = []

    # Lo mínimo indispensable: las MISMAS tres que ya tiene el .env de cualquier otra
    # app CONAF (IAM_URL, CLIENT_ID, CLIENT_SECRET). Todo lo demás tiene default o se
    # deduce, para que copiar un .env del ecosistema baste para arrancar.
    for nombre, valor in (
        ("IAM_URL", IAM_URL),
        ("IAM_CLIENT_ID", IAM_CLIENT_ID),
        ("IAM_CLIENT_SECRET", IAM_CLIENT_SECRET),
    ):
        if not valor:
            faltan.append(nombre)
            problemas.append(f"{nombre} sin definir")

    # Solo puede faltar si TAMBIÉN falta CLIENT_SECRET (del que se deriva), en cuyo
    # caso ya está reportado arriba y repetirlo solo confunde.
    if not SESSION_SECRET:
        if IAM_CLIENT_SECRET:
            faltan.append("SESSION_SECRET")
            problemas.append("SESSION_SECRET sin definir y no se pudo derivar")
    elif _SESSION_SECRET_EXPLICITO and _secreto_debil(_SESSION_SECRET_EXPLICITO):
        # La validación de fortaleza aplica solo al valor tecleado: el derivado es un
        # hash de 64 hex por construcción.
        faltan.append("SESSION_SECRET")
        problemas.append("SESSION_SECRET débil — generar con `openssl rand -hex 32`")

    # Advertencias: NO bloquean el login, solo se registran.
    if not _SESSION_SECRET_EXPLICITO and SESSION_SECRET:
        avisos.append(
            "SESSION_SECRET derivado del CLIENT_SECRET (no se definió uno propio). "
            "Funciona, pero rotar el CLIENT_SECRET en el IAM cerrará todas las sesiones."
        )
    if IAM_APP_ID is None:
        avisos.append(
            "IAM_APP_ID sin definir: no se verificará que el token del IAM sea de esta "
            "aplicación. Es defensa en profundidad — con el patrón BFF el token lo pide "
            "este backend con su propio client_id/secret, así que no hay riesgo real."
        )
    if ES_PRODUCCION and not SESION_HTTPS_ONLY:
        avisos.append("SESION_HTTPS_ONLY=false en producción: la cookie de sesión viaja sin Secure")
    if IAM_REDIRECT_URI.endswith("/"):
        avisos.append(
            "IAM_REDIRECT_URI termina en '/': el IAM compara por igualdad EXACTA de string; "
            "confirmar que se registró con la barra"
        )
    if ES_PRODUCCION and not ORIGENES_PERMITIDOS:
        avisos.append("ORIGENES_PERMITIDOS vacío: sin verificación de Origin en las escrituras")

    return faltan, problemas, avisos


FALTANTES, PROBLEMAS, ADVERTENCIAS = _evaluar_configuracion()

# Si es False, /api/auth/* y /api/me responden 503 y NINGUNA sesión se considera
# válida (ver dependencias.obtener_sesion). No se lanza en el import: matar el
# proceso dejaría el contenedor unhealthy y, por el depends_on de docker-compose,
# `app` no arrancaría — un 502 mudo en vez de una pantalla que dice qué falta.
# Ver backend/app/db/bootstrap.py, que documenta la misma invariante.
CONFIGURACION_OK = not PROBLEMAS
