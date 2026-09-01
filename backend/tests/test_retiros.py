"""Retiros: la vía por la que un medio pide que dejemos de listar su contenido.

Lo que más importa probar acá no es el CRUD, sino las dos propiedades que hacen que el
mecanismo sirva y no sea un arma: una solicitud pendiente NO oculta nada, y una aplicada
oculta de inmediato en AMBAS superficies sin esperar la corrida horaria.
"""
from tests.conftest import SesionFalsa, fila_metadatos, fila_noticia, fila_retiro


def test_una_solicitud_pendiente_no_oculta_nada(cliente_con):
    # Si bastara con enviar el formulario público, cualquiera podría vaciar el boletín.
    bd = SesionFalsa(
        noticias=[fila_noticia(id="https://mediouno.cl/nota-1")],
        metadatos=fila_metadatos(),
        retiros=[fila_retiro(estado="pendiente", clave="https://mediouno.cl/nota-1")],
    )
    cliente = cliente_con(bd)

    ids = [n["id"] for n in cliente.get("/api/noticias").json()["noticias"]]

    assert ids == ["https://mediouno.cl/nota-1"]


def test_un_retiro_aplicado_oculta_la_nota_en_la_portada_publica(cliente_con):
    bd = SesionFalsa(
        noticias=[
            fila_noticia(id="https://mediouno.cl/nota-1"),
            fila_noticia(id="https://otro.cl/nota-9"),
        ],
        metadatos=fila_metadatos(),
        retiros=[fila_retiro(estado="aplicado", clave="https://mediouno.cl/nota-1")],
    )
    cliente = cliente_con(bd)

    ids = [n["id"] for n in cliente.get("/api/noticias").json()["noticias"]]

    assert ids == ["https://otro.cl/nota-9"]


def test_un_retiro_aplicado_tambien_oculta_en_la_superficie_interna(cliente_con):
    # El retiro no es un filtro de presentación pública: el contenido retirado tampoco
    # puede seguir visible para quien inició sesión.
    bd = SesionFalsa(
        noticias=[
            fila_noticia(id="https://mediouno.cl/nota-1"),
            fila_noticia(id="https://otro.cl/nota-9"),
        ],
        metadatos=fila_metadatos(),
        retiros=[fila_retiro(estado="aplicado", clave="https://mediouno.cl/nota-1")],
    )
    cliente = cliente_con(bd, sesion="admin")

    ids = [n["id"] for n in cliente.get("/api/noticias").json()["noticias"]]

    assert ids == ["https://otro.cl/nota-9"]


def test_un_retiro_de_medio_completo_oculta_todas_sus_notas(cliente_con):
    bd = SesionFalsa(
        noticias=[
            fila_noticia(id="a", medio_id="medio-uno"),
            fila_noticia(id="b", medio_id="medio-uno"),
            fila_noticia(id="c", medio_id="otro-medio"),
        ],
        metadatos=fila_metadatos(),
        retiros=[fila_retiro(ambito="medio", estado="aplicado", clave="medio-uno")],
    )
    cliente = cliente_con(bd)

    ids = [n["id"] for n in cliente.get("/api/noticias").json()["noticias"]]

    assert ids == ["c"]


def test_un_retiro_rechazado_no_oculta(cliente_con):
    bd = SesionFalsa(
        noticias=[fila_noticia(id="https://mediouno.cl/nota-1")],
        metadatos=fila_metadatos(),
        retiros=[fila_retiro(estado="rechazado", clave="https://mediouno.cl/nota-1")],
    )
    cliente = cliente_con(bd)

    assert len(cliente.get("/api/noticias").json()["noticias"]) == 1


def test_el_historico_tambien_respeta_los_retiros(cliente_con):
    # El archivo no puede seguir sirviendo lo que se pidió retirar.
    bd = SesionFalsa(
        noticias=[fila_noticia(id="a"), fila_noticia(id="b")],
        metadatos=fila_metadatos(),
        retiros=[fila_retiro(estado="aplicado", clave="a")],
    )
    cliente = cliente_con(bd, sesion="general")

    cuerpo = cliente.get("/api/historico").json()

    assert [n["id"] for n in cuerpo["resultados"]] == ["b"]
    # El total tiene que contar lo mostrado, no lo filtrado: si no, la paginación
    # prometería una página que no existe.
    assert cuerpo["total"] == 1


def test_el_formulario_de_retiro_es_publico(cliente_con):
    bd = SesionFalsa(metadatos=fila_metadatos())
    cliente = cliente_con(bd)

    respuesta = cliente.post(
        "/api/retiros",
        json={
            "ambito": "noticia",
            "clave": "https://mediouno.cl/nota-1",
            "solicitante": "Jefatura de prensa",
            "contacto": "prensa@mediouno.cl",
        },
    )

    assert respuesta.status_code == 201
    # No devuelve id ni estado: quien envía no está autenticado y un identificador
    # consultable abriría una vía para enumerar solicitudes ajenas.
    assert respuesta.json() == {"recibida": True}


def test_la_bandeja_de_retiros_exige_admin(cliente_con):
    bd = SesionFalsa(metadatos=fila_metadatos())

    assert cliente_con(bd).get("/api/retiros").status_code == 401
    assert cliente_con(bd, sesion="general").get("/api/retiros").status_code == 403


def test_una_clave_vacia_se_rechaza(cliente_con):
    cliente = cliente_con(SesionFalsa(metadatos=fila_metadatos()))

    respuesta = cliente.post("/api/retiros", json={"ambito": "noticia", "clave": "   "})

    assert respuesta.status_code == 422
