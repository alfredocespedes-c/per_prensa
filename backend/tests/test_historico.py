"""/api/historico: archivo paginado sobre la tabla `noticias` (upsert-only),
con cota dura de rango temporal (SEC-02). v3: detrás del login (el guard se
aplica en el include_router de main.py)."""
from datetime import datetime, timedelta, timezone

from tests.conftest import SesionFalsa, fila_noticia


def _hace_dias(dias):
    return datetime.now(timezone.utc) - timedelta(days=dias)


def _cliente(cliente_con, filas):
    # Usuario general autenticado: el histórico no exige rol admin.
    return cliente_con(SesionFalsa(noticias=filas), sesion="general")


def test_sin_sesion_responde_401(cliente_con):
    # v3: el histórico quedó detrás del login. Anónimo → 401 del guard real.
    respuesta = cliente_con(SesionFalsa()).get("/api/historico")
    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == "sesion_requerida"


def test_pagina_y_total_consistentes(cliente_con):
    filas = [
        fila_noticia(id=f"n-{i}", fecha=_hace_dias(i), fecha_deteccion=_hace_dias(i)) for i in range(5)
    ]
    cliente = _cliente(cliente_con, filas)

    cuerpo = cliente.get("/api/historico", params={"pagina": 2, "tamanoPagina": 2}).json()

    assert cuerpo["total"] == 5
    assert cuerpo["pagina"] == 2
    assert [n["id"] for n in cuerpo["resultados"]] == ["n-2", "n-3"]


def test_filtra_por_medio_y_seccion(cliente_con):
    filas = [
        fila_noticia(id="a", medio_id="medio-uno", seccion_id="digital", fecha_deteccion=_hace_dias(1)),
        fila_noticia(id="b", medio_id="medio-dos", seccion_id="radio", fecha_deteccion=_hace_dias(1)),
    ]
    cliente = _cliente(cliente_con, filas)

    por_medio = cliente.get("/api/historico", params={"medioId": "medio-dos"}).json()
    assert [n["id"] for n in por_medio["resultados"]] == ["b"]

    por_seccion = cliente.get("/api/historico", params={"seccionId": "digital"}).json()
    assert [n["id"] for n in por_seccion["resultados"]] == ["a"]


def test_rango_por_defecto_es_30_dias(cliente_con):
    filas = [
        fila_noticia(id="reciente", fecha_deteccion=_hace_dias(5)),
        fila_noticia(id="vieja", fecha_deteccion=_hace_dias(60)),
    ]
    cliente = _cliente(cliente_con, filas)

    cuerpo = cliente.get("/api/historico").json()

    assert [n["id"] for n in cuerpo["resultados"]] == ["reciente"]


def test_desde_mas_antiguo_que_la_cota_dura_se_recorta_a_400_dias(cliente_con):
    # SEC-02: aunque el cliente pida 10 años, jamás se escanea más allá de 400
    # días — acota el costo sobre una tabla que crece sin borrar filas.
    filas = [
        fila_noticia(id="dentro", fecha_deteccion=_hace_dias(300)),
        fila_noticia(id="fuera", fecha_deteccion=_hace_dias(500)),
    ]
    cliente = _cliente(cliente_con, filas)

    cuerpo = cliente.get("/api/historico", params={"desde": _hace_dias(3650).isoformat()}).json()

    assert [n["id"] for n in cuerpo["resultados"]] == ["dentro"]


def test_parametros_invalidos_devuelven_422(cliente_con):
    cliente = _cliente(cliente_con, [])

    assert cliente.get("/api/historico", params={"pagina": 0}).status_code == 422
    assert cliente.get("/api/historico", params={"tamanoPagina": 201}).status_code == 422
    assert cliente.get("/api/historico", params={"desde": "no-es-fecha"}).status_code == 422
