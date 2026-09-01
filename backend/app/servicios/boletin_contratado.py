"""Reglas del boletín del servicio contratado — puro, sin I/O.

Hermano de servicios/conceptos.py: acá viven las reglas, no las consultas. Lo único que
este módulo toca de la base es `registrar()`, que recibe la sesión ya abierta.

POR QUÉ EXISTE LA VALIDACIÓN DE LA URL. El enlace lo pega un admin a mano y la portada
lo presenta como "el boletín oficial" en un enlace destacado que se abre en pestaña
nueva. Sin lista blanca, un error de copiado —o un admin con la cuenta comprometida—
convierte ese bloque en un enlace a cualquier sitio, con el aval visual de la app.

POR QUÉ urlsplit Y NO startswith. `https://mediastation.simbiu.es@evil.example/x` empieza
por el host correcto y apunta a otro servidor; `https://mediastation.simbiu.es.evil.example/x`
también. Se compara el HOSTNAME exacto, y se rechazan credenciales embebidas y puerto.
"""
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

from .. import config
from ..db.models import BoletinContratado, BoletinContratadoNoticia

# Verificado empíricamente en agosto de 2026: el proveedor sirve los boletines en
# https://mediastation.simbiu.es/Documents/Download/<id>. El resto del sitio exige
# sesión (/, /Documents, /api redirigen a /Account/login); esa ruta no.
HOSTS_POR_DEFECTO = ("mediastation.simbiu.es",)
PATRON_RUTA = re.compile(r"^/Documents/Download/(\d{1,12})$")

LARGO_MAX = 300
FECHA_MINIMA = date(2026, 1, 1)
# Cota generosa a propósito: el servidor razona en UTC y Chile va DETRÁS de UTC (−4/−3),
# así que "hoy en Chile" nunca supera "hoy en UTC". +1 día cubre el margen sin que el
# backend necesite conocer America/Santiago ni depender de que la imagen traiga tzdata.
DIAS_FUTURO = 1

PROVEEDOR = "simbiu"
ORIGENES = ("manual", "correo")


@dataclass(frozen=True)
class EnlaceBoletin:
    url: str
    documento_id: str
    proveedor: str


class EnlaceInvalido(ValueError):
    """Se lanza desde un field_validator de Pydantic, así que sale como 422."""


def hosts_permitidos() -> tuple[str, ...]:
    """Lista blanca efectiva. Configurable por entorno para no depender de un despliegue."""
    if config.BOLETIN_HOSTS_PERMITIDOS:
        return tuple(sorted(config.BOLETIN_HOSTS_PERMITIDOS))
    return HOSTS_POR_DEFECTO


def normalizar_enlace(valor: str) -> EnlaceBoletin:
    """Valida el enlace pegado y devuelve su forma canónica.

    No sabe de HTTP ni de Pydantic: recibe un string. Le da igual si vino de un <input>
    o del cuerpo de un correo — es lo que permite que el futuro adaptador IMAP entre por
    el mismo embudo.
    """
    crudo = (valor or "").strip()
    if not crudo:
        raise EnlaceInvalido("Pegue el enlace del boletín.")
    if len(crudo) > LARGO_MAX:
        raise EnlaceInvalido(f"El enlace no puede superar los {LARGO_MAX} caracteres.")

    partes = urlsplit(crudo)

    if partes.scheme != "https":
        raise EnlaceInvalido("El enlace debe empezar por https://.")
    if partes.username or partes.password:
        raise EnlaceInvalido("El enlace no puede llevar usuario ni contraseña.")
    if partes.query or partes.fragment:
        raise EnlaceInvalido("El enlace no debe llevar parámetros ni ancla.")
    try:
        puerto = partes.port
    except ValueError as error:  # puerto no numérico: urlsplit lo detecta al leerlo
        raise EnlaceInvalido("El enlace tiene un puerto inválido.") from error
    if puerto not in (None, 443):
        raise EnlaceInvalido("El enlace no puede indicar un puerto.")

    host = (partes.hostname or "").lower().rstrip(".")
    permitidos = hosts_permitidos()
    if host not in permitidos:
        raise EnlaceInvalido(
            f"«{host or '—'}» no es el sitio del servicio contratado. "
            f"Se acepta solo: {', '.join(permitidos)}."
        )

    coincide = PATRON_RUTA.match(partes.path)
    if coincide is None:
        raise EnlaceInvalido(
            "El enlace debe ser el de descarga del boletín "
            "(.../Documents/Download/<número>)."
        )

    # Se reconstruye desde host+path: dos admins que peguen la misma URL con distinta
    # capitalización de host guardan lo mismo. La caja del PATH no se toca —no verifiqué
    # que el servidor del proveedor sea insensible a mayúsculas ahí.
    return EnlaceBoletin(
        url=f"https://{host}{partes.path}",
        documento_id=coincide.group(1),
        proveedor=PROVEEDOR,
    )


def validar_fecha(valor: date, hoy_utc: date | None = None) -> date:
    """Piso fijo y techo tolerante. Ver DIAS_FUTURO para por qué no hace falta zoneinfo."""
    tope = (hoy_utc or datetime.now(timezone.utc).date()) + timedelta(days=DIAS_FUTURO)
    if valor < FECHA_MINIMA:
        raise ValueError(
            f"La fecha del boletín no puede ser anterior al {FECHA_MINIMA.isoformat()}."
        )
    if valor > tope:
        raise ValueError("La fecha del boletín no puede ser futura.")
    return valor


def identificador_retrocede(documento_id: str, anterior: str | None) -> bool:
    """¿El identificador del documento es MENOR que el del boletín anterior?

    Los IDs del proveedor son globales de su plataforma y crecen: entre el 25 y el 26 de
    agosto de 2026 avanzaron 5.837. Un retroceso huele a enlace equivocado (por ejemplo,
    volver a pegar el de la semana pasada).

    Es una observación empírica, NO un contrato del proveedor: por eso alimenta un aviso
    y nunca un rechazo. Si algún día el proveedor reinicia su contador, lo peor que pasa
    es un aviso de más.
    """
    if not anterior:
        return False
    try:
        return int(documento_id) < int(anterior)
    except (TypeError, ValueError):
        return False


# ── Acceso a la tabla ─────────────────────────────────────────────────────────
#
# `registrar()` es el ÚNICO escritor de boletines_contratados, y esa es la frontera de
# la decisión 4 (hexagonal): hoy lo llama el router HTTP porque un admin pega la URL;
# mañana lo llamará un adaptador que lea el buzón de correo, sin tocar ni una línea del
# camino de lectura. El router NO hace db.add() por su cuenta.
#
# Ninguna función de acá usa db.get(), .first(), .scalar() ni func.*: el intérprete
# parcial de SQLAlchemy de backend/tests/conftest.py no los implementa, y db.get() en
# particular devuelve SIEMPRE la fila de metadatos —un test de 404 escrito sobre él no
# fallaría jamás. .filter(...).limit(n).all() sí está soportado y es honesto.


def ultimo(db, proveedor: str = PROVEEDOR):
    """El boletín más reciente por fecha, o None."""
    filas = (
        db.query(BoletinContratado)
        .filter(BoletinContratado.proveedor == proveedor)
        .order_by(BoletinContratado.fecha.desc())
        .limit(1)
        .all()
    )
    return filas[0] if filas else None


def historico(db, limite: int = 60, proveedor: str = PROVEEDOR) -> list:
    return (
        db.query(BoletinContratado)
        .filter(BoletinContratado.proveedor == proveedor)
        .order_by(BoletinContratado.fecha.desc())
        .limit(limite)
        .all()
    )


def por_id(db, boletin_id: int):
    filas = (
        db.query(BoletinContratado)
        .filter(BoletinContratado.id == boletin_id)
        .limit(1)
        .all()
    )
    return filas[0] if filas else None


def documento_anterior_a(db, fecha: date, proveedor: str = PROVEEDOR) -> str | None:
    """`documento_id` del boletín inmediatamente anterior a `fecha`.

    Se piden los dos más recientes y se descarta en Python el de la misma fecha, en vez
    de filtrar con `<`: ninguna prueba del intérprete parcial de conftest.py ejercita el
    operador `<`, y no quiero apoyar el diseño en una rama sin cobertura.
    """
    for fila in (
        db.query(BoletinContratado)
        .filter(BoletinContratado.proveedor == proveedor)
        .order_by(BoletinContratado.fecha.desc())
        .limit(2)
        .all()
    ):
        if fila.fecha != fecha:
            return fila.documento_id
    return None


def registrar(
    db,
    *,
    enlace: EnlaceBoletin,
    fecha: date,
    origen: str = "manual",
    actor: str | None = None,
    sub: str | None = None,
    ip: str | None = None,
    ahora: datetime | None = None,
) -> tuple[object, bool, dict | None]:
    """Alta o corrección del boletín de un día. Devuelve (fila, creada, antes).

    `antes` es None en el alta y, en la corrección, el {url, documentoId} previo — para
    que el llamador lo audite sin volver a consultar.

    Volver a registrar el mismo día NO duplica: el índice único (proveedor, fecha) hace
    de árbitro, y esta función lo respeta buscando primero. Eso es también lo que vuelve
    idempotente releer dos veces el mismo correo cuando exista el adaptador IMAP.
    """
    if origen not in ORIGENES:
        raise ValueError(f"Origen desconocido: {origen!r}")

    momento = ahora or datetime.now(timezone.utc)
    existentes = (
        db.query(BoletinContratado)
        .filter(BoletinContratado.proveedor == enlace.proveedor)
        .filter(BoletinContratado.fecha == fecha)
        .limit(1)
        .all()
    )

    if existentes:
        fila = existentes[0]
        antes = {"url": fila.url, "documentoId": fila.documento_id}
        fila.url = enlace.url
        fila.documento_id = enlace.documento_id
        fila.origen = origen
        fila.actualizado_en = momento
        fila.actualizado_por = actor
        db.commit()
        return fila, False, antes

    # registrado_en/actualizado_en se fijan acá y no por el DEFAULT now() del servidor:
    # mismo motivo que Retiro.creado_en en routers/retiros.py.
    fila = BoletinContratado(
        proveedor=enlace.proveedor,
        fecha=fecha,
        url=enlace.url,
        documento_id=enlace.documento_id,
        origen=origen,
        registrado_en=momento,
        registrado_por=actor,
        registrado_sub=sub,
        ip_origen=ip,
        actualizado_en=momento,
        actualizado_por=actor,
    )
    db.add(fila)
    db.commit()
    return fila, True, None


def noticias_de(db, boletin_id: int) -> list:
    """Noticias del boletín, en el orden del documento."""
    return (
        db.query(BoletinContratadoNoticia)
        .filter(BoletinContratadoNoticia.boletin_id == boletin_id)
        .order_by(BoletinContratadoNoticia.orden)
        .all()
    )


def agrupar(noticias) -> list[dict]:
    """Agrupa por (concepto, tipo) CONSERVANDO EL ORDEN DEL DOCUMENTO.

    No se ordena por nombre ni se agrupa con un diccionario suelto: el proveedor decide en
    qué orden van sus secciones y ese orden es información. Es la misma regla que gobierna
    el boletín propio, donde el orden lo fija el admin y nunca el alfabeto.
    """
    grupos: list[dict] = []
    indice: dict[tuple[str, str], int] = {}
    for n in noticias:
        clave = (n.concepto or "", n.tipo or "")
        if clave not in indice:
            indice[clave] = len(grupos)
            grupos.append({"concepto": clave[0], "tipo": clave[1], "noticias": []})
        grupos[indice[clave]]["noticias"].append(
            {
                "titular": n.titular,
                "medio": n.medio,
                "fecha": n.fecha,
                "pagina": n.pagina or "",
                "ambito": n.ambito or "",
                "url": n.url,
            }
        )
    return grupos


def salida(fila, *, incluir_operacion: bool) -> dict:
    """Fila -> dict de la API.

    `incluir_operacion` recorta EN EL SERVIDOR quién registró el enlace: es dato de
    operación, no parte del boletín, y solo lo ve un admin. Mismo criterio que
    CAMPOS_INTERNOS en servicios/mapeo.py — nunca se recorta en React, porque para
    entonces el dato ya viajó.
    """
    datos = {
        "id": fila.id,
        "fecha": fila.fecha,
        "url": fila.url,
        "documentoId": fila.documento_id,
        "proveedor": fila.proveedor,
    }
    if incluir_operacion:
        datos.update(
            {
                "origen": fila.origen,
                "registradoEn": fila.registrado_en,
                "registradoPor": fila.registrado_por,
                "actualizadoEn": fila.actualizado_en,
                "actualizadoPor": fila.actualizado_por,
            }
        )
    return datos
