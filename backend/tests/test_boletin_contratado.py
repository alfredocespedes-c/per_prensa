"""Boletín del servicio contratado: la puerta, el recorte y la validación del enlace.

Lo que estos tests protegen, por orden de importancia:

1. Que un ANÓNIMO no reciba nunca el enlace. Es el requisito central; no hay versión
   recortada para la superficie pública, hay un 401.
2. Que la respuesta no lleve NADA del contenido del boletín. La decisión es "solo el
   enlace", y sin una aserción de claves exactas eso se erosiona en el primer añadido
   bienintencionado.
3. Que la validación del enlace no se pueda saltar. Un `startswith` dejaría pasar
   `https://mediastation.simbiu.es@evil.example/...`, y la portada presentaría ese
   destino como "el boletín oficial".
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.servicios import boletin_contratado as reglas
from conftest import (
    SesionFalsa,
    fila_boletin_contratado,
    fila_boletin_noticia,
    fila_metadatos,
)

ACTUAL = "/api/boletin-contratado/actual"
BASE = "/api/boletin-contratado"
URL_BUENA = "https://mediastation.simbiu.es/Documents/Download/2754012"

# Lo ÚNICO que puede salir de este endpoint. Si alguien añadiera un campo con contenido
# del boletín (titulares, extracto, html…), esta lista lo delata.
CLAVES_LECTURA = ["documentoId", "fecha", "id", "proveedor", "secciones", "url"]
CLAVES_OPERACION = [
    "actualizadoEn", "actualizadoPor", "documentoId", "fecha", "id", "origen",
    "proveedor", "registradoEn", "registradoPor", "secciones", "url",
]


def bd(*boletines, noticias=()):
    return SesionFalsa(
        metadatos=fila_metadatos(), boletines=boletines, boletin_noticias=noticias
    )


# --- La puerta ---------------------------------------------------------------


def test_un_anonimo_no_recibe_nunca_el_enlace(cliente_con):
    # Sin `sesion`, `cliente_con` no sobrescribe nada y corre el guard REAL.
    respuesta = cliente_con(bd(fila_boletin_contratado())).get(ACTUAL)
    assert respuesta.status_code == 401
    assert "simbiu" not in respuesta.text


def test_un_usuario_general_si_recibe_el_enlace(cliente_con):
    respuesta = cliente_con(bd(fila_boletin_contratado()), sesion="general").get(ACTUAL)
    assert respuesta.status_code == 200
    assert respuesta.json()["boletin"]["url"] == URL_BUENA


def test_un_usuario_general_no_ve_quien_lo_registro(cliente_con):
    """El recorte es del SERVIDOR: quién opera el registro no es parte del boletín."""
    base = bd(fila_boletin_contratado())
    general = cliente_con(base, sesion="general").get(ACTUAL).json()["boletin"]
    admin = cliente_con(base, sesion="admin").get(ACTUAL).json()["boletin"]

    assert sorted(general.keys()) == CLAVES_LECTURA
    assert sorted(admin.keys()) == CLAVES_OPERACION
    assert admin["registradoPor"] == "lmonsalve"


def test_la_respuesta_no_lleva_nada_del_contenido(cliente_con):
    """Guarda de la decisión "solo el enlace" — ni titulares, ni html, ni imágenes."""
    cuerpo = cliente_con(bd(fila_boletin_contratado()), sesion="admin").get(ACTUAL).text
    for prohibida in ("html", "titular", "imagen", "extracto", "contenido", "cuerpo"):
        assert prohibida not in cuerpo.lower()


def test_la_respuesta_es_no_store(cliente_con):
    respuesta = cliente_con(bd(fila_boletin_contratado()), sesion="general").get(ACTUAL)
    assert respuesta.headers["Cache-Control"] == "no-store"


def test_devuelve_el_mas_reciente_por_fecha(cliente_con):
    filas = (
        fila_boletin_contratado(id=1, fecha=date(2026, 8, 25), documento_id="2748175"),
        fila_boletin_contratado(id=2, fecha=date(2026, 8, 26), documento_id="2754012"),
        fila_boletin_contratado(id=3, fecha=date(2026, 8, 24), documento_id="2742000"),
    )
    boletin = cliente_con(bd(*filas), sesion="general").get(ACTUAL).json()["boletin"]
    assert boletin["documentoId"] == "2754012"


def test_sin_boletines_responde_200_con_null(cliente_con):
    """Nunca 404: el cliente no debe tener que distinguir "aún no hay" de "se cayó"."""
    respuesta = cliente_con(bd(), sesion="general").get(ACTUAL)
    assert respuesta.status_code == 200
    assert respuesta.json() == {"boletin": None}


def test_el_historico_exige_admin(cliente_con):
    base = bd(fila_boletin_contratado())
    assert cliente_con(base).get(BASE).status_code == 401
    assert cliente_con(base, sesion="general").get(BASE).status_code == 403
    assert cliente_con(base, sesion="admin").get(BASE).status_code == 200


# --- Escritura ---------------------------------------------------------------


def test_registrar_exige_admin(cliente_con):
    cuerpo = {"fecha": "2026-08-26", "url": URL_BUENA}
    assert cliente_con(bd()).post(BASE, json=cuerpo).status_code == 401
    assert cliente_con(bd(), sesion="general").post(BASE, json=cuerpo).status_code == 403


def test_registrar_crea_la_fila(cliente_con):
    respuesta = cliente_con(bd(), sesion="admin").post(
        BASE, json={"fecha": "2026-08-26", "url": URL_BUENA}
    )
    assert respuesta.status_code == 201
    boletin = respuesta.json()["boletin"]
    assert boletin["url"] == URL_BUENA
    assert boletin["documentoId"] == "2754012"
    assert boletin["origen"] == "manual"


def test_registrar_dos_veces_el_mismo_dia_corrige(cliente_con):
    """Volver a pegar no duplica: es corrección. Lo garantiza (proveedor, fecha) único."""
    base = bd(fila_boletin_contratado())
    otra = "https://mediastation.simbiu.es/Documents/Download/2754099"

    respuesta = cliente_con(base, sesion="admin").post(
        BASE, json={"fecha": "2026-08-26", "url": otra}
    )
    assert respuesta.status_code == 200  # 200, no 201: corrigió
    assert respuesta.json()["boletin"]["url"] == otra

    listado = cliente_con(base, sesion="admin").get(BASE).json()["boletines"]
    assert len(listado) == 1
    assert listado[0]["documentoId"] == "2754099"


def test_avisa_si_el_identificador_retrocede_pero_guarda_igual(cliente_con):
    """Los IDs del proveedor crecen; un retroceso huele a enlace equivocado.

    Es una observación empírica, no un contrato: avisa y NO bloquea.
    """
    ayer = fila_boletin_contratado(id=1, fecha=date(2026, 8, 25), documento_id="2748175")
    respuesta = cliente_con(bd(ayer), sesion="admin").post(
        BASE,
        json={"fecha": "2026-08-26", "url": "https://mediastation.simbiu.es/Documents/Download/900"},
    )
    assert respuesta.status_code == 201
    assert "menor" in respuesta.json()["aviso"]
    assert respuesta.json()["boletin"]["documentoId"] == "900"


def test_no_avisa_cuando_el_identificador_avanza(cliente_con):
    ayer = fila_boletin_contratado(id=1, fecha=date(2026, 8, 25), documento_id="2748175")
    respuesta = cliente_con(bd(ayer), sesion="admin").post(
        BASE, json={"fecha": "2026-08-26", "url": URL_BUENA}
    )
    assert respuesta.json()["aviso"] is None


def test_eliminar_exige_admin(cliente_con):
    base = bd(fila_boletin_contratado())
    assert cliente_con(base).delete(f"{BASE}/1").status_code == 401
    assert cliente_con(base, sesion="general").delete(f"{BASE}/1").status_code == 403


def test_eliminar_inexistente_da_404(cliente_con):
    """El test que muere si alguien usa db.get(): el fake devuelve siempre metadatos."""
    respuesta = cliente_con(bd(fila_boletin_contratado()), sesion="admin").delete(f"{BASE}/999")
    assert respuesta.status_code == 404


def test_eliminar_borra_la_fila(cliente_con):
    base = bd(fila_boletin_contratado())
    cliente = cliente_con(base, sesion="admin")
    assert cliente.delete(f"{BASE}/1").status_code == 204
    assert cliente.get(ACTUAL).json() == {"boletin": None}


# --- Validación del enlace: el vector real -----------------------------------


@pytest.mark.parametrize(
    "url",
    [
        pytest.param("https://evil.example/Documents/Download/1", id="host-ajeno"),
        pytest.param(
            "https://mediastation.simbiu.es@evil.example/Documents/Download/1",
            id="credenciales-embebidas",  # el que atrapa un startswith
        ),
        pytest.param(
            "https://mediastation.simbiu.es.evil.example/Documents/Download/1",
            id="subdominio-impostor",
        ),
        pytest.param("http://mediastation.simbiu.es/Documents/Download/1", id="sin-tls"),
        pytest.param(
            "https://mediastation.simbiu.es/Account/login?ReturnUrl=%2F",
            id="ruta-que-no-es-de-descarga",
        ),
        pytest.param(
            "https://mediastation.simbiu.es:8443/Documents/Download/1", id="puerto"
        ),
        pytest.param(
            "https://mediastation.simbiu.es/Documents/Download/1?x=1", id="con-parametros"
        ),
        pytest.param("javascript:alert(1)", id="javascript"),
        pytest.param("", id="vacio"),
    ],
)
def test_registrar_rechaza_enlaces_invalidos(cliente_con, url):
    respuesta = cliente_con(bd(), sesion="admin").post(
        BASE, json={"fecha": "2026-08-26", "url": url}
    )
    assert respuesta.status_code == 422


def test_el_error_nombra_el_host_rechazado(cliente_con):
    """Para que un cambio de dominio del proveedor se entienda al instante."""
    respuesta = cliente_con(bd(), sesion="admin").post(
        BASE, json={"fecha": "2026-08-26", "url": "https://otro.example/Documents/Download/1"}
    )
    assert "otro.example" in respuesta.text


def test_registrar_rechaza_fecha_futura(cliente_con):
    futuro = (datetime.now(timezone.utc).date() + timedelta(days=5)).isoformat()
    respuesta = cliente_con(bd(), sesion="admin").post(
        BASE, json={"fecha": futuro, "url": URL_BUENA}
    )
    assert respuesta.status_code == 422


# --- Reglas puras (sin TestClient) -------------------------------------------


def test_normalizar_devuelve_la_forma_canonica():
    enlace = reglas.normalizar_enlace("  https://MEDIASTATION.Simbiu.ES/Documents/Download/2754012  ")
    assert enlace.url == URL_BUENA
    assert enlace.documento_id == "2754012"
    assert enlace.proveedor == "simbiu"


def test_la_cota_de_fecha_tolera_el_desfase_con_chile():
    """Chile va DETRÁS de UTC: "hoy en Chile" nunca supera "hoy en UTC"."""
    hoy_utc = date(2026, 8, 26)
    assert reglas.validar_fecha(date(2026, 8, 26), hoy_utc) == date(2026, 8, 26)
    assert reglas.validar_fecha(date(2026, 8, 27), hoy_utc) == date(2026, 8, 27)
    with pytest.raises(ValueError):
        reglas.validar_fecha(date(2026, 8, 28), hoy_utc)
    with pytest.raises(ValueError):
        reglas.validar_fecha(date(2025, 12, 31), hoy_utc)


def test_el_retroceso_de_identificador_no_revienta_con_basura():
    assert reglas.identificador_retrocede("900", "2748175") is True
    assert reglas.identificador_retrocede("2754012", "2748175") is False
    assert reglas.identificador_retrocede("2754012", None) is False
    assert reglas.identificador_retrocede("2754012", "no-es-un-numero") is False


# --- El desglose por secciones -----------------------------------------------


def _bd_con_desglose():
    return bd(
        fila_boletin_contratado(id=1),
        noticias=(
            fila_boletin_noticia(id=1, orden=0, tipo="Impresos", titular="Uno"),
            fila_boletin_noticia(id=2, orden=1, tipo="Impresos", titular="Dos"),
            fila_boletin_noticia(id=3, orden=2, tipo="Digital", titular="Tres", medio="msn.com"),
            fila_boletin_noticia(id=4, orden=3, concepto="SERNAFOR", tipo="Digital", titular="Cuatro"),
        ),
    )


def test_el_desglose_agrupa_por_concepto_y_tipo(cliente_con):
    boletin = cliente_con(_bd_con_desglose(), sesion="general").get(ACTUAL).json()["boletin"]
    secciones = [(s["concepto"], s["tipo"], len(s["noticias"])) for s in boletin["secciones"]]
    # En el ORDEN DEL DOCUMENTO, nunca alfabético.
    assert secciones == [("CONAF", "Impresos", 2), ("CONAF", "Digital", 1), ("SERNAFOR", "Digital", 1)]


def test_cada_noticia_trae_titular_medio_fecha_y_su_enlace(cliente_con):
    boletin = cliente_con(_bd_con_desglose(), sesion="general").get(ACTUAL).json()["boletin"]
    primera = boletin["secciones"][0]["noticias"][0]
    assert primera["titular"] == "Uno"
    assert primera["medio"] == "EL MERCURIO (C)"
    assert primera["fecha"] == "2026-08-26"
    assert primera["url"].endswith("/file.pdf/9")


def test_el_desglose_no_lleva_texto_del_medio(cliente_con):
    """Se decidió titular + medio + fecha. El extracto se queda en el boletín."""
    boletin = cliente_con(_bd_con_desglose(), sesion="general").get(ACTUAL).json()["boletin"]
    claves = sorted(boletin["secciones"][0]["noticias"][0].keys())
    assert claves == ["ambito", "fecha", "medio", "pagina", "titular", "url"]


def test_un_general_ve_el_desglose_igual_que_un_admin(cliente_con):
    """El desglose ES el boletín, no un dato de operación: no se recorta por rol."""
    base = _bd_con_desglose()
    general = cliente_con(base, sesion="general").get(ACTUAL).json()["boletin"]
    admin = cliente_con(base, sesion="admin").get(ACTUAL).json()["boletin"]
    assert general["secciones"] == admin["secciones"]


def test_un_anonimo_no_recibe_ni_los_titulares(cliente_con):
    respuesta = cliente_con(_bd_con_desglose()).get(ACTUAL)
    assert respuesta.status_code == 401
    assert "Morro Moreno" not in respuesta.text and "Uno" not in respuesta.text


def test_sin_desglose_procesado_las_secciones_van_vacias(cliente_con):
    """La portada cae entonces al enlace al boletín completo, que siempre está."""
    boletin = cliente_con(bd(fila_boletin_contratado()), sesion="general").get(ACTUAL).json()["boletin"]
    assert boletin["secciones"] == []
    assert boletin["url"].endswith("/2754012")
