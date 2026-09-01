"""Del documento del proveedor a la lista de noticias. Puro: sin red ni base de datos.

QUÉ SE EXTRAE Y QUÉ NO. Solo **titular, medio, fecha, página y el enlace propio de la
noticia**. NO se extrae el extracto, aunque el boletín lo trae: mostrar dos líneas del
texto del medio es reproducir contenido ajeno, y la decisión fue quedarse en la
referencia. Lo que no se extrae no se puede filtrar por descuido más adelante.

Y NUNCA IMÁGENES. El documento trae 278: recortes de prensa, capturas de TV y las
cabeceras de cada medio (`/cabeceras/HOYCHIG.png`). Ninguna se toca — es la decisión 6-bis
de CLAUDE.md, y hay una prueba que falla si aparece algo que capture `<img`.

CÓMO ESTÁ ARMADO EL DOCUMENTO (verificado sobre el boletín del 26-08-2026):

  #0f5738 -> concepto             CONAF, SERNAFOR, Sector Forestal
  #007e48 -> tipo O ámbito        Impresos, Radio, Tv, Digital ... y también Santiago
  #666666 -> ámbito               Regionales

DOS TRAMPAS DEL FORMATO, las dos descubiertas comparando con el documento real:

1. EL COLOR NO DISTINGUE tipo de ámbito: el proveedor pinta `Impresos` y `Santiago` con
   el mismo #007e48. Por eso el nivel se decide por una LISTA CONOCIDA de tipos de medio
   y no por el color. Sin esto, «Santiago» pisaba a «Impresos» y todas las noticias
   quedaban bajo el tipo equivocado.

2. EL TITULAR TIENE DOS FORMAS. En prensa escrita la clase va en un <span> interior:
       <a href="...PressRecorte..."><span class="txtseguimiento01">TITULAR</span></a>
   pero en los digitales va en el propio <a>:
       <a href="...PdfUrl" class="txtseguimiento01"><span>TITULAR</span></a>
   Buscar solo la primera forma devolvía 58 noticias de 273: todo lo digital, de radio y
   de TV se perdía en silencio.

La atribución también viene en dos formatos:
   «26/08/2026 - EL MERCURIO (C) - CHILE - 5»    (impresos: medio, país, página)
   «26/08/2026 2:20:00 - msn.com/es-cl»          (digital: con hora, sin país ni página)

El recorrido es LINEAL: se buscan esas marcas en el orden en que aparecen y se arrastra la
sección vigente. Es lo que permite que cada noticia sepa bajo qué concepto y tipo cae sin
construir un árbol DOM.
"""
import re
from dataclasses import dataclass
from datetime import date

# El color solo separa el concepto (nivel 1) del resto. Ver la trampa 1.
COLOR_CONCEPTO = "0f5738"

# Tipos de medio del proveedor. Es lo que permite distinguir «Impresos» (tipo) de
# «Santiago» (ámbito) cuando los dos vienen pintados igual. Una etiqueta desconocida se
# trata como ámbito, salvo que el concepto todavía no tenga tipo: así un tipo nuevo del
# proveedor degrada a «sección sin clasificar» en vez de perderse.
TIPOS_CONOCIDOS = frozenset(
    {
        "impresos", "prensa escrita", "radio", "tv", "television", "televisión",
        "digital", "internet", "revistas", "agencias", "internacional",
        "redes sociales",
    }
)

MARCA_TITULAR = "txtseguimiento01"

# Una sola expresión con tres alternativas nombradas: `finditer` las devuelve en el ORDEN
# DEL DOCUMENTO, que es justo lo que hace falta para arrastrar la sección vigente.
#
# El titular captura el ANCLA COMPLETA (atributos + contenido) y luego se comprueba en
# código si la marca aparece en cualquiera de los dos: es lo que cubre las dos formas del
# documento sin escribir dos expresiones que se desincronicen.
_MARCAS = re.compile(
    r"""
    (?P<seccion>background-color:\s*\#(?P<color>0f5738|007E48|666666)\b[^>]*>
        (?:\s*<[^>]+>)*\s*(?P<etiqueta>[^<\n]{2,60}?)\s*<)
  | (?P<titular><a\s(?P<attrs>[^>]*)>(?P<inner>(?:(?!</a>).){0,4000})</a>)
  | (?P<atribucion><td\s+style="color:\s*\#aaa;[^"]*">\s*(?P<pie>[^<]{4,160}?)\s*</td>)
    """,
    re.I | re.X | re.S,
)

_HREF = re.compile(r'href="([^"]+)"', re.I)
_FECHA_PIE = re.compile(r"^(?P<dia>\d{1,2})/(?P<mes>\d{1,2})/(?P<anio>\d{4})")
_ETIQUETAS = re.compile(r"<[^>]+>")

_ENTIDADES = {
    "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'",
    "&lt;": "<", "&gt;": ">", "&aacute;": "á", "&eacute;": "é",
    "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ",
}


def _texto_plano(fragmento: str) -> str:
    limpio = _ETIQUETAS.sub(" ", fragmento or "")
    for entidad, caracter in _ENTIDADES.items():
        limpio = limpio.replace(entidad, caracter)
    return re.sub(r"\s+", " ", limpio).strip()


@dataclass(frozen=True)
class NoticiaBoletin:
    orden: int
    concepto: str
    tipo: str
    ambito: str
    titular: str
    medio: str
    fecha: date | None
    pagina: str
    url: str


def parsear_pie(pie: str) -> tuple[date | None, str, str]:
    """'26/08/2026 - HOYXHOY - CHILE - 5' -> (fecha, medio, pagina).

    TRES formatos, no dos. Radio y TV traen campos vacíos y un guion suelto al final:

        26/08/2026 - EL MERCURIO (C) - CHILE - 5       impresos
        26/08/2026 2:20:00 - msn.com/es-cl             digital
        25/08/2026  -  - Radio Biobío (Puerto Montt) - radio y TV

    Sin descartar los trozos vacíos, el tercer formato dejaba el medio en blanco: eso eran
    34 de 273 noticias sin atribución, justo las de radio y televisión.
    """
    partes = [p.strip() for p in (pie or "").split(" - ")]
    # Los vacíos son separadores de campos que el proveedor deja sin rellenar.
    partes = [p for p in partes if p]
    if not partes:
        return None, "", ""

    m = _FECHA_PIE.match(partes[0])
    fecha = None
    if m:
        try:
            fecha = date(int(m.group("anio")), int(m.group("mes")), int(m.group("dia")))
        except ValueError:
            fecha = None
    resto = partes[1:] if m else partes

    if not resto:
        return fecha, "", ""

    # Con país y página, la página es el último trozo y el país el penúltimo. El medio se
    # reconstruye con lo que queda, para no partir un nombre que lleve « - ».
    if len(resto) >= 3 and len(resto[-1]) <= 8:
        medio, pagina = " - ".join(resto[:-2]), resto[-1]
    else:
        medio, pagina = resto[0], ""

    return fecha, medio.strip(" -\t")[:120], pagina.strip(" -")[:20]


def parsear(html: str) -> list[NoticiaBoletin]:
    """Noticias en el orden del documento.

    Nunca lanza: un boletín con formato inesperado devuelve menos noticias, no rompe la
    corrida. Perder cobertura es malo; que el servicio muera es peor.
    """
    noticias: list[NoticiaBoletin] = []
    concepto = tipo = ambito = ""
    pendiente = None  # (titular, url) ya visto, esperando su línea de atribución

    for m in _MARCAS.finditer(html or ""):
        if m.group("seccion"):
            etiqueta = _texto_plano(m.group("etiqueta"))
            if not etiqueta:
                continue
            if m.group("color").lower() == COLOR_CONCEPTO:
                # Un concepto nuevo reinicia los niveles inferiores: si no, el primer
                # bloque de SERNAFOR heredaría el «Digital» con el que terminó CONAF.
                concepto, tipo, ambito = etiqueta, "", ""
            elif etiqueta.lower() in TIPOS_CONOCIDOS or not tipo:
                tipo, ambito = etiqueta, ""
            else:
                ambito = etiqueta

        elif m.group("titular") is not None:
            attrs, inner = m.group("attrs") or "", m.group("inner") or ""
            if MARCA_TITULAR not in attrs and MARCA_TITULAR not in inner:
                continue  # un ancla cualquiera (miniatura, «ver más»), no un titular
            href = _HREF.search(attrs)
            titular = _texto_plano(inner)
            pendiente = (titular, href.group(1)) if (titular and href) else None

        elif m.group("atribucion") is not None and pendiente is not None:
            fecha, medio, pagina = parsear_pie(m.group("pie"))
            titular, url = pendiente
            pendiente = None
            noticias.append(
                NoticiaBoletin(
                    orden=len(noticias),
                    concepto=concepto, tipo=tipo, ambito=ambito,
                    titular=titular[:400], medio=medio, fecha=fecha,
                    pagina=pagina, url=url[:500],
                )
            )

    return noticias


def resumen_por_seccion(noticias) -> list[tuple[str, str, int]]:
    """[(concepto, tipo, cuantas)] en orden de aparición. Para el log de la corrida."""
    orden: list[tuple[str, str]] = []
    cuenta: dict[tuple[str, str], int] = {}
    for n in noticias:
        clave = (n.concepto, n.tipo)
        if clave not in cuenta:
            orden.append(clave)
            cuenta[clave] = 0
        cuenta[clave] += 1
    return [(c, t, cuenta[(c, t)]) for c, t in orden]
