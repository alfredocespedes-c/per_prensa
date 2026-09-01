"""Derechos del titular: localizar y suprimir lo asociado a un nombre."""
from tests.conftest import SesionFalsa, fila_metadatos, fila_noticia


def _bd():
    return SesionFalsa(
        noticias=[
            fila_noticia(id="a", autor="María González", titular="CONAF firma convenio"),
            fila_noticia(
                id="b",
                autor=None,
                titular="Declaración de María González sobre el plan",
            ),
            fila_noticia(
                id="c",
                autor=None,
                titular="Incendio en Conguillío",
                extracto=[{"texto": "según María González, la meta", "resaltado": False}],
            ),
            fila_noticia(id="d", autor="Otro Autor", titular="Sin relación"),
        ],
        metadatos=fila_metadatos(),
    )


def test_localiza_el_nombre_en_autor_titular_y_extracto(cliente_con):
    cliente = cliente_con(_bd(), sesion="admin")

    cuerpo = cliente.get("/api/datos-personales", params={"nombre": "María González"}).json()

    assert cuerpo["total"] == 3
    por_id = {c["id"]: c for c in cuerpo["coincidencias"]}
    assert por_id["a"]["campos"] == ["autor"]
    assert por_id["b"]["campos"] == ["titular"]
    assert por_id["c"]["campos"] == ["extracto"]
    assert "d" not in por_id


def test_la_busqueda_es_insensible_a_mayusculas(cliente_con):
    cliente = cliente_con(_bd(), sesion="admin")
    assert cliente.get("/api/datos-personales", params={"nombre": "maría gonzález"}).json()["total"] == 3


def test_rechaza_un_nombre_demasiado_corto(cliente_con):
    # Un nombre de 3 letras casaría con media base y la supresión sería un borrado masivo.
    cliente = cliente_con(_bd(), sesion="admin")

    respuesta = cliente.get("/api/datos-personales", params={"nombre": "Ana"})

    assert respuesta.status_code == 422
    assert "caracteres" in respuesta.json()["detail"]


def test_solo_el_admin_puede_consultar(cliente_con):
    # Buscar por el nombre de una persona es en sí un tratamiento de datos.
    bd = _bd()
    assert cliente_con(bd).get("/api/datos-personales", params={"nombre": "María González"}).status_code == 401
    assert (
        cliente_con(bd, sesion="general")
        .get("/api/datos-personales", params={"nombre": "María González"})
        .status_code
        == 403
    )


def test_la_supresion_borra_las_filas_de_verdad(cliente_con):
    # Un derecho de supresión que solo oculta no es supresión.
    bd = _bd()
    cliente = cliente_con(bd, sesion="admin")

    cuerpo = cliente.request("DELETE", "/api/datos-personales", params={"nombre": "María González"}).json()

    assert cuerpo["borradas"] == 3
    restantes = [n["id"] for n in cliente.get("/api/noticias").json()["noticias"]]
    assert restantes == ["d"]


def test_la_supresion_deja_un_retiro_para_que_no_vuelva(cliente_con):
    # Sin el retiro, el recolector reingresaría la nota desde el feed en la corrida
    # siguiente y la supresión duraría menos de una hora.
    bd = _bd()
    cliente = cliente_con(bd, sesion="admin")

    cliente.request("DELETE", "/api/datos-personales", params={"nombre": "María González"})

    retiros = cliente.get("/api/retiros").json()["retiros"]
    assert len(retiros) == 3
    assert all(r["estado"] == "aplicado" for r in retiros)
    assert {r["clave"] for r in retiros} == {"a", "b", "c"}


def test_la_supresion_exige_admin(cliente_con):
    bd = _bd()
    respuesta = cliente_con(bd, sesion="general").request(
        "DELETE", "/api/datos-personales", params={"nombre": "María González"}
    )
    assert respuesta.status_code == 403
