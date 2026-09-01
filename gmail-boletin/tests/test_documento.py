"""Parseo del documento del proveedor.

Los fragmentos de HTML están copiados del boletín REAL del 26-08-2026, no inventados: las
dos formas del titular y los tres formatos de la línea de atribución son exactamente los
que rompieron las primeras versiones del parser.
"""
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.documento import parsear, parsear_pie, resumen_por_seccion  # noqa: E402

CONCEPTO = '<td style="background-color: #0f5738;"><span>{}</span></td>'
SECCION = '<td style="background-color: #007E48;"><span>{}</span></td>'
AMBITO = '<span style="background-color: #666666;">{}</span>'

# Prensa escrita: la clase va en un <span> DENTRO del ancla.
IMPRESO = (
    '<td><a href="https://mediastation.simbiu.es/files/index/1/1/PressRecorte/2026-08-26/file.pdf/9"'
    ' target="_blank"> <span class="txtseguimiento01"><strong>{}</strong></span> </a></td>'
    '<td style="color: #aaa; padding: 3px;">26/08/2026 - EL MERCURIO (C) - CHILE - 5</td>'
)
# Digital: la clase va en el PROPIO ancla.
DIGITAL = (
    '<td><a href="https://mediastation.simbiu.es/files/index/5/2/PdfUrl" class="txtseguimiento01"'
    ' target="_blank"> <span style="font-weight: bold;">{}</span> </a></td>'
    '<td style="color: #aaa; padding: 3px;">26/08/2026 2:20:00 - msn.com/es-cl</td>'
)
# Radio/TV: campos vacíos y un guion suelto al final.
RADIO = (
    '<td><a href="https://mediastation.simbiu.es/files/OirNoticia/1/3/2026-08-25/"'
    ' class="txtseguimiento01"> <span>{}</span> </a></td>'
    '<td style="color: #aaa; padding: 3px;">25/08/2026  -  - Radio Biobío (Puerto Montt) -</td>'
)


# --- La línea de atribución, en sus tres formatos -----------------------------


@pytest.mark.parametrize(
    "pie, esperado",
    [
        ("26/08/2026 - EL MERCURIO (C) - CHILE - 5", (date(2026, 8, 26), "EL MERCURIO (C)", "5")),
        ("26/08/2026 2:20:00 - msn.com/es-cl", (date(2026, 8, 26), "msn.com/es-cl", "")),
        # El que dejaba 34 noticias sin medio.
        ("25/08/2026  -  - Radio Biobío (Puerto Montt) -", (date(2026, 8, 25), "Radio Biobío (Puerto Montt)", "")),
        ("26/08/2026 - DIARIO OFICIAL 1 NORMAS GENERALES - CHILE - 73",
         (date(2026, 8, 26), "DIARIO OFICIAL 1 NORMAS GENERALES", "73")),
    ],
)
def test_parsea_los_tres_formatos_de_atribucion(pie, esperado):
    assert parsear_pie(pie) == esperado


def test_un_medio_con_guion_en_el_nombre_no_se_parte():
    fecha, medio, pagina = parsear_pie("26/08/2026 - LA PRENSA - AUSTRAL - CHILE - 10")
    assert medio == "LA PRENSA - AUSTRAL"
    assert pagina == "10"


def test_un_pie_ilegible_no_revienta():
    assert parsear_pie("cualquier cosa") == (None, "cualquier cosa", "")
    assert parsear_pie("") == (None, "", "")


# --- Las dos formas del titular ----------------------------------------------


def test_reconoce_el_titular_de_prensa_escrita():
    ns = parsear(CONCEPTO.format("CONAF") + SECCION.format("Impresos") + IMPRESO.format("Titular impreso"))
    assert len(ns) == 1
    assert ns[0].titular == "Titular impreso"
    assert ns[0].medio == "EL MERCURIO (C)"
    assert ns[0].url.endswith("/file.pdf/9")


def test_reconoce_el_titular_digital_con_la_clase_en_el_ancla():
    # La forma que faltaba: devolvía 58 de 273 noticias.
    ns = parsear(CONCEPTO.format("CONAF") + SECCION.format("Digital") + DIGITAL.format("Titular digital"))
    assert len(ns) == 1
    assert ns[0].titular == "Titular digital"
    assert ns[0].medio == "msn.com/es-cl"


def test_ignora_las_anclas_que_no_son_titulares():
    # La miniatura del medio es un <a> con un <img> dentro. Ni es titular ni debe contar.
    ruido = '<td><a href="https://mediastation.simbiu.es/x.pdf"><img src="https://mediastation.simbiu.es/cabeceras/H.png"></a></td>'
    ns = parsear(CONCEPTO.format("CONAF") + SECCION.format("Impresos") + ruido + IMPRESO.format("El bueno"))
    assert [n.titular for n in ns] == ["El bueno"]


# --- La jerarquía -------------------------------------------------------------


def test_el_ambito_no_pisa_al_tipo_de_medio():
    # «Impresos» y «Santiago» vienen del MISMO color. Sin la lista de tipos conocidos,
    # «Santiago» se convertía en el tipo y todo quedaba mal clasificado.
    html = (
        CONCEPTO.format("CONAF")
        + SECCION.format("Impresos")
        + SECCION.format("Santiago")
        + IMPRESO.format("Nota uno")
    )
    ns = parsear(html)
    assert ns[0].tipo == "Impresos"
    assert ns[0].ambito == "Santiago"


def test_un_concepto_nuevo_reinicia_tipo_y_ambito():
    # Si no, el primer bloque de SERNAFOR heredaría el «Digital» con el que cerró CONAF.
    html = (
        CONCEPTO.format("CONAF") + SECCION.format("Digital") + AMBITO.format("Regionales")
        + DIGITAL.format("De CONAF")
        + CONCEPTO.format("SERNAFOR") + SECCION.format("Impresos") + IMPRESO.format("De SERNAFOR")
    )
    ns = parsear(html)
    assert (ns[0].concepto, ns[0].tipo, ns[0].ambito) == ("CONAF", "Digital", "Regionales")
    assert (ns[1].concepto, ns[1].tipo, ns[1].ambito) == ("SERNAFOR", "Impresos", "")


def test_un_tipo_desconocido_no_se_pierde():
    # Si el proveedor añade un tipo nuevo, debe quedar como tipo, no desaparecer.
    ns = parsear(CONCEPTO.format("CONAF") + SECCION.format("Podcast") + IMPRESO.format("Nota"))
    assert ns[0].tipo == "Podcast"


def test_resumen_por_seccion_conserva_el_orden_del_documento():
    html = (
        CONCEPTO.format("CONAF") + SECCION.format("Impresos") + IMPRESO.format("A")
        + SECCION.format("Digital") + DIGITAL.format("B") + DIGITAL.format("C")
    )
    assert resumen_por_seccion(parsear(html)) == [("CONAF", "Impresos", 1), ("CONAF", "Digital", 2)]


# --- Guardas ------------------------------------------------------------------


def test_nunca_extrae_una_imagen():
    """Decisión 6-bis: la cadena de imágenes de prensa está cortada.

    El documento real trae 278 <img> (recortes, capturas de TV y cabeceras de medios).
    Ninguna puede salir de acá, ni como URL suelta.
    """
    html = (
        CONCEPTO.format("CONAF") + SECCION.format("Impresos")
        + '<td><a href="https://mediastation.simbiu.es/cabeceras/HOYCHIG.png">'
          '<img src="https://mediastation.simbiu.es/_BD/2026/AGO/25/foto.jpg" width="61"></a></td>'
        + IMPRESO.format("Nota con miniatura al lado")
    )
    ns = parsear(html)
    assert len(ns) == 1
    for n in ns:
        assert not n.url.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp"))
        assert "foto.jpg" not in n.url and "cabeceras" not in n.url


def test_no_se_extrae_el_extracto():
    """Se muestra titular, medio y fecha. El texto del medio se queda en el boletín."""
    from app.documento import NoticiaBoletin

    campos = set(NoticiaBoletin.__dataclass_fields__)
    assert "extracto" not in campos and "texto" not in campos and "cuerpo" not in campos


def test_un_documento_vacio_o_roto_devuelve_lista_vacia():
    assert parsear("") == []
    assert parsear("<html><body>nada</body></html>") == []
    assert parsear(None) == []


def test_un_titular_sin_atribucion_no_roba_la_del_siguiente():
    html = (
        CONCEPTO.format("CONAF") + SECCION.format("Impresos")
        + '<td><a href="https://x.cl/1"><span class="txtseguimiento01">Huérfano</span></a></td>'
        + IMPRESO.format("Con pie")
    )
    ns = parsear(html)
    assert [n.titular for n in ns] == ["Con pie"]
    assert ns[0].medio == "EL MERCURIO (C)"
