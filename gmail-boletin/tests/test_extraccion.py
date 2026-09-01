"""Los tres filtros que separan «un correo cualquiera» de «el boletín de hoy».

El cuerpo de estas pruebas está calcado de un correo REAL de noticias@conaf.cl: primera
línea el enlace del documento, luego la fecha en castellano entre asteriscos, luego los
titulares, cada uno envuelto en un enlace del rastreador del proveedor. Ese detalle —que
haya decenas de enlaces y solo uno sirva— es justo lo que se prueba.
"""
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extraccion import (  # noqa: E402
    CorreoDescartado,
    buscar_enlace,
    buscar_fecha,
    correo_del_remitente,
    detectar,
    remitente_permitido,
)

HOSTS = ("mediastation.simbiu.es",)
REMITENTES = ("noticias@conaf.cl",)

CUERPO_REAL = """https://mediastation.simbiu.es/Documents/Download/2754012

*miércoles, 26 de agosto de 2026*
*TITULARES*

- Desierto Florido 2026: proyección de Conaf anticipa una extensa floración
<https://r.comunicacion.simbiu.online/tr/cl/_po7GXJrF83wuCmQveTwPU7taqEIxKT9>
- refuerzan infraestructura, seguridad y conectividad
<https://r.comunicacion.simbiu.online/tr/cl/VREj7jj8Nm3QZ1LJpX31GJLoBfC17Y1t>
"""


def hacer(**cambios):
    argumentos = dict(
        mensaje_id="abc123",
        remitente="Noticias Conaf <noticias@conaf.cl>",
        texto=CUERPO_REAL,
        fecha_recepcion=date(2026, 8, 26),
        hosts_permitidos=HOSTS,
        remitentes_permitidos=REMITENTES,
    )
    argumentos.update(cambios)
    return detectar(**argumentos)


# --- Camino feliz ------------------------------------------------------------


def test_extrae_enlace_documento_y_fecha_de_un_correo_real():
    b = hacer()
    assert b.url == "https://mediastation.simbiu.es/Documents/Download/2754012"
    assert b.documento_id == "2754012"
    assert b.fecha == date(2026, 8, 26)
    assert b.remitente == "noticias@conaf.cl"


# --- Filtro 1: remitente -----------------------------------------------------


def test_descarta_un_remitente_no_autorizado():
    # El caso real: un reenvío del propio boletín desde otra cuenta de CONAF.
    with pytest.raises(CorreoDescartado, match="remitente"):
        hacer(remitente="Luis Monsalve <luis.monsalve@conaf.cl>")


def test_el_nombre_para_mostrar_no_sirve_para_colarse():
    # Quien envía elige su nombre para mostrar: si se comparara la cabecera cruda con un
    # `in`, esto pasaría el filtro apuntando a otro buzón.
    with pytest.raises(CorreoDescartado, match="remitente"):
        hacer(remitente='"Noticias Conaf <noticias@conaf.cl>" <atacante@example.com>')


def test_admite_lista_por_dominio():
    assert remitente_permitido("x <alguien@conaf.cl>", ("@conaf.cl",)) is True
    assert remitente_permitido("x <alguien@otra.cl>", ("@conaf.cl",)) is False


def test_extrae_la_direccion_de_la_cabecera():
    assert correo_del_remitente("Noticias Conaf <NOTICIAS@conaf.cl>") == "noticias@conaf.cl"
    assert correo_del_remitente("sin direccion") == ""


# --- Filtro 2: enlace --------------------------------------------------------


def test_elige_el_enlace_del_documento_y_no_los_del_rastreador():
    url, documento = buscar_enlace(CUERPO_REAL, HOSTS)
    assert url.endswith("/Documents/Download/2754012")
    assert "r.comunicacion" not in url
    assert documento == "2754012"


def test_descarta_un_host_ajeno():
    with pytest.raises(CorreoDescartado, match="enlace"):
        hacer(texto="https://evil.example/Documents/Download/1\n*26 de agosto de 2026*")


def test_un_subdominio_impostor_no_cuenta():
    url, _ = buscar_enlace(
        "https://mediastation.simbiu.es.evil.example/Documents/Download/1", HOSTS
    )
    assert url == ""


def test_descarta_un_correo_sin_enlace():
    with pytest.raises(CorreoDescartado, match="enlace"):
        hacer(texto="Boletín SECOM CONAF\n*miércoles, 26 de agosto de 2026*\nsin enlaces")


# --- Filtro 3: fecha ---------------------------------------------------------


def test_la_fecha_sale_del_boletin_y_no_de_cuando_llego_el_correo():
    # Un reenvío tardío llega HOY con el boletín de ANTEAYER. Fechar por recepción lo
    # publicaría como el de hoy, que es el error que la portada existe para no cometer.
    b = hacer(fecha_recepcion=date(2026, 8, 28))
    assert b.fecha == date(2026, 8, 26)


def test_sin_fecha_en_el_texto_usa_la_de_recepcion():
    texto = "https://mediastation.simbiu.es/Documents/Download/2754012\nsin fecha escrita"
    assert hacer(texto=texto, fecha_recepcion=date(2026, 8, 26)).fecha == date(2026, 8, 26)


def test_sin_fecha_de_ninguna_parte_se_descarta():
    texto = "https://mediastation.simbiu.es/Documents/Download/2754012\nsin fecha"
    with pytest.raises(CorreoDescartado, match="fecha"):
        hacer(texto=texto, fecha_recepcion=None)


@pytest.mark.parametrize(
    "texto, esperada",
    [
        ("*miércoles, 26 de agosto de 2026*", date(2026, 8, 26)),
        ("lunes, 24 de agosto de 2026", date(2026, 8, 24)),
        ("miercoles 1 de enero de 2027", date(2027, 1, 1)),
        ("20 de julio de 2026", date(2026, 7, 20)),
        ("13 de setiembre de 2026", date(2026, 9, 13)),
    ],
)
def test_reconoce_las_formas_de_fecha_del_boletin(texto, esperada):
    assert buscar_fecha(texto) == esperada


def test_una_fecha_imposible_no_revienta():
    assert buscar_fecha("31 de febrero de 2026") is None


def test_sin_fecha_devuelve_none():
    assert buscar_fecha("no hay ninguna fecha acá") is None
