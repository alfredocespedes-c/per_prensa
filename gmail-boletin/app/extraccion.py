"""Del correo al ENLACE del boletín. Puro: ni red, ni base de datos.

Esto es lo que reemplaza al pegado manual del administrador. Y por eso mismo es la pieza
que más hay que desconfiar: un correo es una entrada que llega de fuera, y lo que salga de
acá se publica en la portada como «el boletín oficial» a todo el que tenga sesión.

TRES FILTROS, Y NINGUNO SOBRA:

1. REMITENTE. La búsqueda de Gmail (`subject:"Boletín SECOM CONAF"`) no autentica nada:
   cualquiera que escriba a esa casilla con ese asunto entra en los resultados. Sin lista
   blanca de remitentes, mandar un correo con ese asunto y un enlace bastaría para
   publicar lo que uno quiera. Es el vector real de esta funcionalidad.
2. ENLACE. Se acepta solo `https://<host permitido>/Documents/Download/<número>`. El
   correo trae DECENAS de enlaces (cada titular pasa por el rastreador
   r.comunicacion.simbiu.online): hay que quedarse con el del documento y con ninguno más.
3. FECHA. Sale del propio boletín («miércoles, 26 de agosto de 2026»), no de cuándo llegó
   el correo. Un reenvío tardío del boletín de ayer llegaría hoy, y fechar por hora de
   llegada lo publicaría como el de hoy — que es exactamente el error que la portada
   existe para no cometer.
"""
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from email.utils import parseaddr

# Mismo host que valida el backend. Se repite a propósito y no se importa: son dos
# procesos distintos, y acoplarlos obligaría a compartir código entre Python del backend y
# Python de este contenedor sin ganar nada. La lista blanca es corta y estable.
HOSTS_POR_DEFECTO = ("mediastation.simbiu.es",)
REMITENTES_POR_DEFECTO = ("noticias@conaf.cl",)

_PATRON_ENLACE = re.compile(
    r"https://(?P<host>[A-Za-z0-9.-]+)/Documents/Download/(?P<documento>\d{1,12})\b"
)
# Solo para COMPROBAR que lo que devolvió parseaddr tiene forma de dirección; nunca para
# buscarla dentro de la cabecera (ver correo_del_remitente).
_FORMA_CORREO = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}
# «miércoles, 26 de agosto de 2026». El día de la semana es opcional y la coma también:
# el texto plano del correo mete asteriscos y saltos de línea en medio.
_PATRON_FECHA = re.compile(
    r"(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)?\s*,?\s*"
    r"(?P<dia>\d{1,2})\s+de\s+(?P<mes>[a-z]+)\s+de\s+(?P<anio>20\d{2})"
)


@dataclass(frozen=True)
class BoletinDetectado:
    fecha: date
    url: str
    documento_id: str
    mensaje_id: str
    remitente: str


class CorreoDescartado(Exception):
    """El correo no es un boletín utilizable. Trae el motivo, para poder registrarlo."""


def _sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto.lower())
        if unicodedata.category(c) != "Mn"
    )


def correo_del_remitente(cabecera: str) -> str:
    """`Noticias Conaf <noticias@conaf.cl>` -> `noticias@conaf.cl`.

    SE USA parseaddr Y NO UNA EXPRESIÓN REGULAR, y esto no es preferencia de estilo: una
    regex que busque «la primera dirección de la cabecera» se deja engañar por el nombre
    para mostrar, que lo elige quien envía. La cabecera

        "Noticias Conaf <noticias@conaf.cl>" <atacante@example.com>

    tiene como remitente REAL a atacante@example.com, pero una búsqueda encuentra primero
    noticias@conaf.cl y da por bueno el correo. Lo detectó una prueba, no el diseño.

    parseaddr aplica las reglas de RFC 5322 y además falla CERRADO ante cabeceras
    malformadas (devuelve cadena vacía), que es lo que se quiere en un filtro de seguridad.
    """
    _, direccion = parseaddr(cabecera or "")
    direccion = (direccion or "").strip().lower()
    # parseaddr devuelve el primer átomo aunque no sea una dirección ("sin direccion" ->
    # "sin"), así que se comprueba la forma antes de dar nada por válido.
    return direccion if _FORMA_CORREO.match(direccion) else ""


def remitente_permitido(cabecera: str, permitidos) -> bool:
    """Coincidencia por dirección exacta, o por dominio si la entrada empieza con '@'.

    Se compara la dirección EXTRAÍDA y no la cabecera entera: el nombre para mostrar lo
    elige quien envía, así que un remitente cualquiera podría llamarse
    «Noticias Conaf <noticias@conaf.cl>» y pasar un `in` sobre la cabecera cruda.
    """
    direccion = correo_del_remitente(cabecera)
    if not direccion:
        return False
    for permitido in permitidos:
        permitido = (permitido or "").strip().lower()
        if not permitido:
            continue
        if permitido.startswith("@"):
            if direccion.endswith(permitido):
                return True
        elif direccion == permitido:
            return True
    return False


def buscar_enlace(texto: str, hosts_permitidos) -> tuple[str, str]:
    """Primer enlace de documento cuyo host esté en la lista blanca. ('', '') si no hay.

    Se recorre en orden y se devuelve el PRIMERO: en el boletín, el enlace al documento
    va en la primera línea, antes de los titulares.
    """
    permitidos = {h.strip().lower().rstrip(".") for h in hosts_permitidos if h and h.strip()}
    for coincidencia in _PATRON_ENLACE.finditer(texto or ""):
        host = coincidencia.group("host").lower().rstrip(".")
        if host in permitidos:
            documento = coincidencia.group("documento")
            return f"https://{host}/Documents/Download/{documento}", documento
    return "", ""


def buscar_fecha(texto: str) -> date | None:
    """Fecha en castellano dentro del cuerpo. None si no hay ninguna reconocible."""
    plano = _sin_tildes(texto or "")
    for coincidencia in _PATRON_FECHA.finditer(plano):
        mes = _MESES.get(coincidencia.group("mes"))
        if mes is None:
            continue
        try:
            return date(int(coincidencia.group("anio")), mes, int(coincidencia.group("dia")))
        except ValueError:
            continue  # 31 de febrero y compañía
    return None


def detectar(
    *,
    mensaje_id: str,
    remitente: str,
    texto: str,
    fecha_recepcion: date | None,
    hosts_permitidos=HOSTS_POR_DEFECTO,
    remitentes_permitidos=REMITENTES_POR_DEFECTO,
) -> BoletinDetectado:
    """Aplica los tres filtros. Lanza CorreoDescartado con el motivo si alguno falla."""
    if not remitente_permitido(remitente, remitentes_permitidos):
        raise CorreoDescartado(
            f"remitente no autorizado: {correo_del_remitente(remitente) or '(sin dirección)'}"
        )

    url, documento_id = buscar_enlace(texto, hosts_permitidos)
    if not url:
        raise CorreoDescartado("el correo no contiene un enlace de documento del proveedor")

    fecha = buscar_fecha(texto)
    if fecha is None:
        # Respaldo y no fuente principal: ver el encabezado del módulo. Si el boletín no
        # dice su fecha, la de recepción es lo mejor que hay, pero se prefiere siempre la
        # escrita, que sobrevive a un reenvío.
        fecha = fecha_recepcion
    if fecha is None:
        raise CorreoDescartado("no se pudo determinar la fecha del boletín")

    return BoletinDetectado(
        fecha=fecha,
        url=url,
        documento_id=documento_id,
        mensaje_id=mensaje_id,
        remitente=correo_del_remitente(remitente),
    )
