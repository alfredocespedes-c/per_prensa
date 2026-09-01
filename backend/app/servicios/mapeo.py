"""Único lugar que mapea una fila `noticias` (snake_case, ver db/models.py) al shape
camelCase que el frontend espera (ver dominio/noticia.js en el collector).

Y, desde el rediseño de exposición legal, el único lugar donde se decide QUÉ ve cada
superficie. Son dos productos distintos con reglas distintas:

  - PÚBLICA (sin sesión): referencia bibliográfica y nada más. Titular, medio, fecha y
    enlace al original. NI autor, NI extracto, NI imagen, NI análisis derivado.
  - INTERNA (tras COIPO IAM): lo anterior más el autor y el extracto (≤500 caracteres,
    centrado en la mención) y el análisis completo. Imagen tampoco: el sistema dejó de
    tratarlas, así que no existe el campo en ninguna de las dos.

La lista exacta de lo público la fija `backend/tests/test_mapeo.py` con una igualdad
(`sorted(noticia.keys()) == CLAVES_PUBLICAS`), no con un "contiene": una columna nueva
no puede colarse a la portada sin que esa prueba se ponga roja.

El recorte ocurre ACÁ, en el servidor, y no en React. Truncar en el cliente no reduce
ninguna exposición: para entonces el dato ya viajó al navegador de un anónimo y está en
su caché, en el DevTools y en cualquier proxy intermedio. Este archivo es la frontera
real; si un campo nuevo debe quedar fuera de la portada pública, se decide en
CAMPOS_INTERNOS y en ningún otro sitio.
"""
from typing import Literal

Superficie = Literal["publica", "interna"]

# Campos que SOLO existen en la superficie interna. La lista es explícita (y no un
# "todo menos...") para que agregar una columna nueva al modelo no la publique sola:
# un campo nuevo aparece en ambas superficies solo si alguien lo escribe abajo, y si
# debe ser interno hay que anotarlo acá a conciencia.
CAMPOS_INTERNOS = (
    "extracto",             # contenido del medio
    "analisis",             # tono, entidades, regiones, riesgo: derivado del contenido
    "eventId",              # agrupación de cobertura; señal analítica, no bibliográfica
    "excluida",             # revela que existe un mecanismo de ocultamiento...
    "excluidaPor",          # ...y qué concepto lo activó
    "conceptosDetectados",  # la lista completa es señal de cómo se busca; el principal no
    # El nombre de quien firma la nota. Es un dato personal, y aunque el medio ya lo
    # publicó, una cosa es que aparezca en su sitio y otra que este sistema lo liste en
    # una página abierta a público indeterminado. No basta con ocultarlo en React: si
    # viajara al navegador anónimo seguiría estando expuesto —en la caché, en el
    # inspector, en cualquier proxy—, que es justamente el error que este archivo existe
    # para evitar. Se conserva en la superficie interna, donde cumple la atribución.
    "autor",
)


def fila_a_noticia(fila, superficie: Superficie = "interna") -> dict:
    # Base común: es la ficha de referencia. Todo lo de acá identifica la nota y lleva
    # a su original; nada de esto es contenido del medio.
    noticia = {
        "id": fila.id,
        "url": fila.url,
        "medioId": fila.medio_id,
        "medioNombre": fila.medio_nombre,
        "seccionId": fila.seccion_id,
        "titular": fila.titular,
        "fecha": fila.fecha,
        "fechaDeteccion": fila.fecha_deteccion,
        "fechaReal": fila.fecha_real,
        # NO hay campo de imagen, en ninguna superficie. El sistema dejó de tratarlas por
        # decisión del departamento legal: no se extraen, no se guardan y no se muestran.
        # Nivel 1 de la jerarquía: va en AMBAS superficies porque gobierna cómo se agrupa
        # el boletín, y sin él la portada pública no podría ordenarse. Es el nombre de un
        # concepto de búsqueda, no contenido del medio.
        "conceptoPrincipal": fila.concepto_principal,
    }

    if superficie == "publica":
        return noticia

    noticia.update({
        # Atribución al autor: solo tras el login (ver CAMPOS_INTERNOS).
        "autor": fila.autor,
        "extracto": fila.extracto or [],
        "eventId": fila.event_id,
        "analisis": fila.analisis,
        "conceptosDetectados": list(fila.conceptos_detectados or []),
        # Siempre presentes en el shape interno, incluso para un usuario general (que
        # solo recibe noticias visibles): la vista de auditoría del admin los necesita y
        # tener el campo opcional obligaría a defenderse en cada consumidor.
        "excluida": bool(fila.excluida),
        "excluidaPor": list(fila.excluida_por or []),
    })
    return noticia


def superficie_de(sesion) -> Superficie:
    """Una sola regla, en un solo lugar: sin sesión, superficie pública.

    Se deriva de la sesión y NUNCA de un parámetro de la petición: un `?superficie=`
    convertiría la separación en algo que el cliente elige, que es exactamente lo que no
    puede ser.
    """
    return "interna" if sesion is not None else "publica"
