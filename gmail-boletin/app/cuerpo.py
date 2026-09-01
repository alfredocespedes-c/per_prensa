"""Procesamiento del cuerpo: MIME recursivo, Base64 URL-safe y HTML a texto limpio.

Este módulo es PURO: recibe el `payload` que devuelve la Gmail API y no habla con la red
ni con la configuración. Es lo que permite probarlo con un payload de mentira.

TRES COSAS QUE SE HACEN MAL A MENUDO Y ACÁ NO:

1. Gmail codifica en Base64 URL-SAFE y SIN relleno. `base64.b64decode` normal falla o
   corrompe; hay que usar `urlsafe_b64decode` y reponer el '=' que falta.
2. Un multipart puede contener otro multipart (multipart/mixed con un
   multipart/alternative dentro). El recorrido tiene que ser RECURSIVO; quedarse en el
   primer nivel es lo que hace que un correo "no tenga cuerpo".
3. Los adjuntos son partes text/* igual que el cuerpo. Si no se descartan por `filename`,
   un .txt adjunto termina impreso como si fuera el correo.
"""
import base64
import re
from dataclasses import dataclass
from html.parser import HTMLParser

# Etiquetas cuyo CONTENIDO no es texto visible.
_ETIQUETAS_INVISIBLES = {"script", "style", "head", "title", "meta", "link", "noscript"}
# Etiquetas que separan bloques: sin esto, todo el HTML sale como un párrafo continuo.
_ETIQUETAS_BLOQUE = {
    "p", "div", "br", "hr", "tr", "td", "th", "li", "ul", "ol", "table", "tbody",
    "section", "article", "header", "footer", "nav", "blockquote", "pre",
    "h1", "h2", "h3", "h4", "h5", "h6",
}


@dataclass(frozen=True)
class CuerpoExtraido:
    texto: str
    # 'text/plain', 'text/html' o '' si el correo no traía cuerpo textual.
    origen: str
    adjuntos: tuple[str, ...] = ()


class _ExtractorTexto(HTMLParser):
    """HTML a texto plano con la biblioteca estándar.

    Se evita una dependencia de parseo (bs4/lxml) a propósito: para pasar de HTML a texto
    legible no hace falta un árbol DOM, y cada dependencia es superficie de actualización
    y de CVE en una imagen que corre desatendida.

    `convert_charrefs=True` (el valor por defecto desde 3.5) resuelve `&nbsp;` y compañía
    antes de llegar a handle_data.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._trozos: list[str] = []
        self._profundidad_invisible = 0

    def handle_starttag(self, tag, attrs):
        if tag in _ETIQUETAS_INVISIBLES:
            self._profundidad_invisible += 1
        elif tag in _ETIQUETAS_BLOQUE:
            self._trozos.append("\n")

    def handle_endtag(self, tag):
        if tag in _ETIQUETAS_INVISIBLES:
            self._profundidad_invisible = max(0, self._profundidad_invisible - 1)
        elif tag in _ETIQUETAS_BLOQUE:
            self._trozos.append("\n")

    def handle_data(self, data):
        if self._profundidad_invisible == 0:
            self._trozos.append(data)

    def texto(self) -> str:
        return "".join(self._trozos)


def _normalizar_espacios(texto: str) -> str:
    texto = texto.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    # Espacios y tabuladores repetidos dentro de la línea.
    texto = re.sub(r"[ \t\f\v]+", " ", texto)
    # Espacios pegados al salto de línea.
    texto = re.sub(r" *\n *", "\n", texto)
    # Tres o más saltos seguidos: una línea en blanco basta como separación.
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


def html_a_texto(html: str) -> str:
    """HTML -> texto limpio. Tolerante: un HTML roto devuelve lo que se pudo leer."""
    extractor = _ExtractorTexto()
    try:
        extractor.feed(html)
        extractor.close()
    except Exception:  # noqa: BLE001 - HTMLParser puede quejarse de marcado imposible
        pass
    return _normalizar_espacios(extractor.texto())


def decodificar(datos: str, charset: str = "utf-8") -> str:
    """Base64 URL-safe de Gmail -> str.

    Gmail omite el relleno '='. Sin reponerlo, `urlsafe_b64decode` lanza "Invalid
    base64-encoded string" en cualquier cuerpo cuyo largo no sea múltiplo de 4, que es la
    mayoría.
    """
    if not datos:
        return ""
    relleno = "=" * (-len(datos) % 4)
    try:
        crudo = base64.urlsafe_b64decode(datos + relleno)
    except (ValueError, TypeError):
        return ""
    try:
        return crudo.decode(charset, errors="replace")
    except LookupError:
        # Charset declarado que Python no conoce: mejor texto con algún carácter raro
        # que perder el correo entero.
        return crudo.decode("utf-8", errors="replace")


def _charset_de(parte: dict) -> str:
    for cabecera in parte.get("headers") or []:
        if (cabecera.get("name") or "").lower() == "content-type":
            for fragmento in (cabecera.get("value") or "").split(";"):
                fragmento = fragmento.strip()
                if fragmento.lower().startswith("charset="):
                    return fragmento.split("=", 1)[1].strip().strip('"\'') or "utf-8"
    return "utf-8"


def _recorrer(parte: dict, planas: list[tuple[str, str]], adjuntos: list[str]) -> None:
    """Recorrido RECURSIVO en profundidad. Acumula hojas de texto y nombres de adjuntos."""
    if not parte:
        return

    tipo = (parte.get("mimeType") or "").lower()
    nombre_archivo = (parte.get("filename") or "").strip()
    subpartes = parte.get("parts") or []

    if subpartes:
        for subparte in subpartes:
            _recorrer(subparte, planas, adjuntos)
        return

    # Una parte con filename es un ADJUNTO, aunque su mimeType sea text/plain.
    if nombre_archivo:
        adjuntos.append(nombre_archivo)
        return

    if tipo in ("text/plain", "text/html"):
        datos = (parte.get("body") or {}).get("data") or ""
        texto = decodificar(datos, _charset_de(parte))
        if texto.strip():
            planas.append((tipo, texto))


def extraer_cuerpo(payload: dict) -> CuerpoExtraido:
    """Cuerpo del correo, prefiriendo SIEMPRE text/plain sobre text/html.

    La preferencia es global y no por rama del árbol: en un multipart/mixed con un
    multipart/alternative dentro, el text/plain puede estar varios niveles más abajo que
    el primer text/html que aparece.
    """
    planas: list[tuple[str, str]] = []
    adjuntos: list[str] = []
    _recorrer(payload or {}, planas, adjuntos)

    for tipo, texto in planas:
        if tipo == "text/plain":
            return CuerpoExtraido(_normalizar_espacios(texto), "text/plain", tuple(adjuntos))

    for tipo, texto in planas:
        if tipo == "text/html":
            return CuerpoExtraido(html_a_texto(texto), "text/html", tuple(adjuntos))

    return CuerpoExtraido("", "", tuple(adjuntos))
