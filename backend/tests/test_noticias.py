"""/api/noticias: reemplazo directo de data/noticias.json para el frontend —
mismo shape camelCase y mismo orden que la ventana del collector."""
from datetime import datetime, timezone

from types import SimpleNamespace

from tests.conftest import SesionFalsa, fila_metadatos, fila_noticia


def _seccion(id, nombre, orden):
    return SimpleNamespace(id=id, nombre=nombre, orden=orden)


def test_devuelve_el_contrato_completo_en_camel_case(cliente_con):
    cliente = cliente_con(
        SesionFalsa(
            noticias=[fila_noticia()],
            secciones=[_seccion("digital", "Digital", 4)],
            metadatos=fila_metadatos(),
        ),
        sesion="general",
    )

    respuesta = cliente.get("/api/noticias")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    # Contrato con el frontend: mismas claves que noticias.json (sin las cachés
    # internas resolucionesGoogle/sitemapVisto/robotsCache, que nadie consume).
    # `conceptos` es el nivel 1 de la jerarquía: el boletín se agrupa por concepto y el
    # orden lo define el admin, así que el frontend no puede deducirlo de los datos.
    assert sorted(cuerpo.keys()) == [
        "conceptos",
        "generadoEn",
        "noticias",
        "secciones",
        "tamanoVentana",
    ]
    noticia = cuerpo["noticias"][0]
    assert noticia["medioId"] == "medio-uno"
    assert noticia["medioNombre"] == "Medio Uno"
    assert noticia["fechaDeteccion"].startswith("2026-08-01T13:00")
    assert noticia["extracto"] == [{"texto": "CONAF", "resaltado": True}]
    assert cuerpo["tamanoVentana"] == 1000


# --- Separación de superficies -----------------------------------------------------
# El frente de exposición que motivó el rediseño: /api/noticias entregaba a cualquier
# anónimo el extracto íntegro y el objeto `analisis` completo (tono, riesgo, personas,
# organizaciones, lugares, regiones). El recorte a 500 caracteres existía solo en React,
# o sea DESPUÉS de que el dato ya había viajado al navegador.

CAMPOS_SOLO_INTERNOS = ["extracto", "analisis", "eventId", "excluida", "excluidaPor", "autor"]


def test_un_anonimo_no_recibe_contenido_del_medio_ni_analisis(cliente_con):
    cliente = cliente_con(SesionFalsa(noticias=[fila_noticia()], metadatos=fila_metadatos()))

    noticia = cliente.get("/api/noticias").json()["noticias"][0]

    for campo in CAMPOS_SOLO_INTERNOS:
        assert campo not in noticia, f"{campo} se filtró a la superficie pública"


def test_un_anonimo_sigue_recibiendo_la_ficha_de_referencia(cliente_con):
    # La portada pública no se vacía: conserva lo necesario para citar la nota y llegar a
    # ella —medio, fecha y el enlace directo—, pero no el nombre de quien la firma.
    cliente = cliente_con(SesionFalsa(noticias=[fila_noticia()], metadatos=fila_metadatos()))

    noticia = cliente.get("/api/noticias").json()["noticias"][0]

    assert sorted(noticia.keys()) == [
        "conceptoPrincipal", "fecha", "fechaDeteccion", "fechaReal", "id",
        "medioId", "medioNombre", "seccionId", "titular", "url",
    ]
    assert noticia["titular"]
    assert noticia["url"]


def test_el_nombre_del_autor_no_viaja_al_navegador_anonimo(cliente_con):
    # No basta con ocultarlo en React: si el dato llegara al cliente seguiría expuesto en
    # la caché, en el inspector y en cualquier proxy intermedio. El recorte es del
    # servidor o no es recorte.
    bd = SesionFalsa(noticias=[fila_noticia(autor="José Carvajal Vega")], metadatos=fila_metadatos())

    anonimo = cliente_con(bd).get("/api/noticias")
    assert "Carvajal" not in anonimo.text

    interno = cliente_con(bd, sesion="general").get("/api/noticias")
    assert interno.json()["noticias"][0]["autor"] == "José Carvajal Vega"


def test_un_usuario_autenticado_si_recibe_el_extracto_y_el_analisis(cliente_con):
    cliente = cliente_con(
        SesionFalsa(noticias=[fila_noticia()], metadatos=fila_metadatos()), sesion="general"
    )

    noticia = cliente.get("/api/noticias").json()["noticias"][0]

    for campo in CAMPOS_SOLO_INTERNOS:
        assert campo in noticia, f"falta {campo} en la superficie interna"
    assert noticia["extracto"] == [{"texto": "CONAF", "resaltado": True}]


def test_solo_viajan_los_conceptos_con_noticias_en_la_ventana(cliente_con):
    # Mandar la lista completa revelaría qué se está vigilando SIN resultados, que es
    # información que hoy no se ve en ninguna parte. En la superficie pública, además,
    # sería publicarla.
    from types import SimpleNamespace

    bd = SesionFalsa(noticias=[fila_noticia()], metadatos=fila_metadatos())
    bd._por_modelo["conceptos"] = [
        SimpleNamespace(id=1, texto="CONAF", tipo="incluir", activo=True, orden=1, creado_en=None),
        SimpleNamespace(id=2, texto="CMPC", tipo="incluir", activo=True, orden=2, creado_en=None),
    ]

    conceptos = cliente_con(bd).get("/api/noticias").json()["conceptos"]

    # La fixture de noticia tiene concepto_principal="CONAF"; CMPC no aparece.
    assert [c["texto"] for c in conceptos] == ["CONAF"]


def test_la_superficie_no_se_puede_elegir_por_parametro(cliente_con):
    # Si un `?superficie=interna` funcionara, la separación sería una preferencia del
    # cliente en vez de un control de acceso.
    cliente = cliente_con(SesionFalsa(noticias=[fila_noticia()], metadatos=fila_metadatos()))

    noticia = cliente.get("/api/noticias", params={"superficie": "interna"}).json()["noticias"][0]

    assert "extracto" not in noticia


def test_la_respuesta_no_es_cacheable(cliente_con):
    # SECOM revisa a las 8:00: una copia cacheada vieja es una página "caída".
    cliente = cliente_con(SesionFalsa(metadatos=fila_metadatos()))
    assert cliente.get("/api/noticias").headers["cache-control"] == "no-store"


def test_ordena_fecha_desc_con_nulos_al_final(cliente_con):
    # Mismo orden que collector/src/dominio/ventana.js: lo más reciente arriba,
    # noticias sin fecha del medio al final.
    filas = [
        fila_noticia(id="a", fecha=datetime(2026, 8, 1, 10, tzinfo=timezone.utc)),
        fila_noticia(id="sin-fecha", fecha=None),
        fila_noticia(id="b", fecha=datetime(2026, 8, 2, 10, tzinfo=timezone.utc)),
    ]
    cliente = cliente_con(SesionFalsa(noticias=filas, metadatos=fila_metadatos()))

    ids = [n["id"] for n in cliente.get("/api/noticias").json()["noticias"]]

    assert ids == ["b", "a", "sin-fecha"]


def test_una_noticia_excluida_no_aparece_para_el_publico(cliente_con):
    # v3, marcado suave: la excluida ocupa cupo de ventana pero no se muestra; el
    # parámetro incluirExcluidas se IGNORA para anónimos (no responde 403 para no
    # confirmar que hay ocultas).
    filas = [
        fila_noticia(id="visible"),
        fila_noticia(id="oculta", excluida=True, excluida_por=["CMPC"]),
    ]
    cliente = cliente_con(SesionFalsa(noticias=filas, metadatos=fila_metadatos()))

    ids = [n["id"] for n in cliente.get("/api/noticias").json()["noticias"]]
    assert ids == ["visible"]

    ids_forzando = [
        n["id"] for n in cliente.get("/api/noticias", params={"incluirExcluidas": "true"}).json()["noticias"]
    ]
    assert ids_forzando == ["visible"]


def test_el_admin_puede_auditar_las_excluidas(cliente_con):
    filas = [
        fila_noticia(id="visible"),
        fila_noticia(id="oculta", excluida=True, excluida_por=["CMPC"]),
    ]
    cliente = cliente_con(SesionFalsa(noticias=filas, metadatos=fila_metadatos()), sesion="admin")

    cuerpo = cliente.get("/api/noticias", params={"incluirExcluidas": "true"}).json()
    porId = {n["id"]: n for n in cuerpo["noticias"]}
    assert set(porId) == {"visible", "oculta"}
    assert porId["oculta"]["excluida"] is True
    assert porId["oculta"]["excluidaPor"] == ["CMPC"]


def test_base_recien_creada_responde_sin_metadatos(cliente_con):
    # Antes de la primera corrida del collector no existe coleccion_metadatos:
    # el endpoint responde igual (página en blanco es un error inaceptable).
    cliente = cliente_con(SesionFalsa(metadatos=None))

    cuerpo = cliente.get("/api/noticias").json()

    assert cuerpo["generadoEn"] is None
    assert cuerpo["noticias"] == []
    assert cuerpo["tamanoVentana"] > 0
