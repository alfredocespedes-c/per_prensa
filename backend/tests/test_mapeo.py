"""servicios/mapeo.py: único traductor snake_case (BD) → camelCase (frontend).

Y, desde el rediseño de exposición legal, el único lugar donde se decide qué ve cada
superficie. Los tests de la superficie PÚBLICA son la guarda de esa decisión: si un campo
interno se filtra, no es un bug que se corrige mañana — es publicación mundial e
irreversible, porque lo recogen cachés, agregadores y raspadores.
"""
from tests.conftest import fila_noticia

from app.servicios.mapeo import CAMPOS_INTERNOS, fila_a_noticia

# Lo único que puede salir sin sesión. Lista exacta y escrita a mano a propósito: si
# alguien agrega un campo al retorno público, este test tiene que obligarlo a justificarlo
# acá, no absorberlo en silencio.
CLAVES_PUBLICAS = [
    "conceptoPrincipal",
    "fecha",
    "fechaDeteccion",
    "fechaReal",
    "id",
    "medioId",
    "medioNombre",
    "seccionId",
    "titular",
    "url",
]


def test_mapea_todas_las_claves_del_contrato():
    noticia = fila_a_noticia(fila_noticia())

    assert sorted(noticia.keys()) == sorted(
        [
            "id",
            "url",
            "medioId",
            "medioNombre",
            "seccionId",
            "titular",
            "fecha",
            "fechaDeteccion",
            "extracto",
            "autor",
            "fechaReal",
            "eventId",
            "analisis",
            "excluida",
            "excluidaPor",
            # Nivel 1 de la jerarquía del boletín: `conceptoPrincipal` va también en la
            # superficie pública (gobierna el agrupamiento); la lista completa, no.
            "conceptoPrincipal",
            "conceptosDetectados",
        ]
    )
    assert noticia["medioId"] == "medio-uno"
    assert noticia["seccionId"] == "digital"
    # v3: los campos de exclusión van SIEMPRE presentes (los usa la auditoría admin).
    assert noticia["excluida"] is False
    assert noticia["excluidaPor"] == []


def test_extracto_nulo_se_normaliza_a_lista_vacia():
    # El frontend itera extracto sin chequear null: la normalización vive aquí.
    noticia = fila_a_noticia(fila_noticia(extracto=None))
    assert noticia["extracto"] == []


def test_analisis_se_pasa_tal_cual():
    analisis = {"version": 3, "sentimiento": {"polaridad": "neutra"}}
    noticia = fila_a_noticia(fila_noticia(analisis=analisis))
    assert noticia["analisis"] == analisis


# --- GUARDA: el recorte de la superficie pública -----------------------------------
# Hasta ahora este archivo solo llamaba a fila_a_noticia(fila), cuya superficie por
# defecto es la INTERNA. Afirmaba el contrato completo y no decía nada sobre lo que sale
# sin sesión: daba tranquilidad sin dar garantía.


def test_la_superficie_publica_entrega_exactamente_las_claves_permitidas():
    noticia = fila_a_noticia(fila_noticia(), "publica")

    assert sorted(noticia.keys()) == CLAVES_PUBLICAS


def test_ningun_campo_interno_sale_en_la_superficie_publica():
    # Derivado de la CONSTANTE, no de una lista copiada: un campo interno nuevo queda
    # cubierto solo, sin que nadie tenga que acordarse de volver acá. Es la diferencia
    # entre una guarda que envejece y una que no.
    noticia = fila_a_noticia(
        fila_noticia(
            autor="José Carvajal Vega",
            analisis={"sentimiento": "negativa", "organizaciones": ["CONAF"]},
            event_id="evt:https://mediouno.cl/nota-1",
        ),
        "publica",
    )

    filtrados = [campo for campo in CAMPOS_INTERNOS if campo in noticia]
    assert filtrados == [], (
        f"campos internos filtrados a la superficie pública: {filtrados}. "
        "No es un bug reversible: lo que sale sin sesión queda en cachés, agregadores y "
        "raspadores."
    )


def test_el_par_que_se_presta_a_confusion_conceptoPrincipal_vs_conceptosDetectados():
    # `conceptoPrincipal` SÍ es público: gobierna cómo se agrupa el boletín y sin él la
    # portada no se puede ordenar. `conceptosDetectados` NO: la lista completa revela
    # cómo está configurada la búsqueda institucional.
    publica = fila_a_noticia(fila_noticia(), "publica")
    interna = fila_a_noticia(fila_noticia(), "interna")

    assert publica["conceptoPrincipal"] == "CONAF"
    assert "conceptosDetectados" not in publica
    assert interna["conceptosDetectados"] == ["CONAF"]


def test_la_superficie_interna_es_un_superconjunto_de_la_publica():
    # Si dejara de serlo, la portada de un usuario autenticado perdería campos respecto de
    # la de un anónimo: un modo de fallo silencioso y difícil de ver a ojo.
    publica = fila_a_noticia(fila_noticia(), "publica")
    interna = fila_a_noticia(fila_noticia(), "interna")

    assert set(publica).issubset(set(interna))


def test_ninguna_superficie_entrega_imagenes():
    # GUARDA de la decisión del departamento legal: las imágenes de noticias salieron de
    # las dos superficies. Se comprueba incluso pasando una fila que traiga el campo, para
    # que la guarda siga valiendo si alguien reintroduce la columna en la base.
    fila = fila_noticia()
    fila.imagen = "https://mediouno.cl/foto.jpg"

    for superficie in ("publica", "interna"):
        noticia = fila_a_noticia(fila, superficie)
        assert "imagen" not in noticia, (
            f"la superficie {superficie} entregó una imagen. El sistema dejó de tratarlas "
            "por decisión del departamento legal: no se extraen, no se guardan y no se "
            "muestran."
        )
        assert "mediouno.cl/foto.jpg" not in str(noticia)


def test_la_superficie_por_defecto_es_la_interna():
    # El resto de la suite depende de este default. Si se invirtiera, muchos tests
    # seguirían pasando mientras el sistema empieza a recortar donde no debe.
    assert fila_a_noticia(fila_noticia()) == fila_a_noticia(fila_noticia(), "interna")
