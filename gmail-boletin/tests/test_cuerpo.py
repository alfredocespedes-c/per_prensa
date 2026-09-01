"""Pruebas del procesamiento del cuerpo: es la parte con trampas reales.

Se prueban con payloads como los que devuelve la Gmail API de verdad (Base64 URL-safe sin
relleno, árbol MIME anidado), no con cadenas ya decodificadas: la mitad de los errores de
esta clase de aplicaciones viven justo en la decodificación.
"""
import base64
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cuerpo import decodificar, extraer_cuerpo, html_a_texto  # noqa: E402


def b64(texto: str) -> str:
    """Como codifica Gmail: URL-safe y SIN relleno."""
    return base64.urlsafe_b64encode(texto.encode("utf-8")).decode("ascii").rstrip("=")


def parte(tipo, texto=None, *, filename="", partes=None, charset="utf-8"):
    p = {
        "mimeType": tipo,
        "filename": filename,
        "headers": [{"name": "Content-Type", "value": f"{tipo}; charset={charset}"}],
        "body": {},
    }
    if texto is not None:
        p["body"] = {"data": b64(texto), "size": len(texto)}
    if partes is not None:
        p["parts"] = partes
    return p


# --- Decodificación ----------------------------------------------------------


@pytest.mark.parametrize("texto", ["a", "ab", "abc", "abcd", "Boletín SECOM CONAF ñ á"])
def test_decodifica_sin_relleno_cualquiera_sea_el_largo(texto):
    # El relleno que Gmail omite es justo lo que hace fallar a base64.b64decode.
    assert decodificar(b64(texto)) == texto


def test_decodifica_los_caracteres_url_safe():
    # '-' y '_' sustituyen a '+' y '/'. Con el alfabeto estándar esto reventaría.
    crudo = bytes([0xFB, 0xFF, 0xBE])
    datos = base64.urlsafe_b64encode(crudo).decode().rstrip("=")
    assert "-" in datos or "_" in datos
    assert decodificar(datos) != ""


def test_un_charset_desconocido_no_pierde_el_correo():
    assert "Boletin" in decodificar(b64("Boletin"), charset="x-inventado-9000")


def test_datos_corruptos_devuelven_vacio_en_vez_de_reventar():
    assert decodificar("no-es-base64-%%%") == ""


# --- Selección de la parte ---------------------------------------------------


def test_prefiere_texto_plano_sobre_html():
    payload = parte(
        "multipart/alternative",
        partes=[parte("text/html", "<p>versión HTML</p>"), parte("text/plain", "versión plana")],
    )
    cuerpo = extraer_cuerpo(payload)
    assert cuerpo.origen == "text/plain"
    assert cuerpo.texto == "versión plana"


def test_si_solo_hay_html_lo_convierte_a_texto():
    payload = parte("text/html", "<h1>Boletín</h1><p>Primera nota</p>")
    cuerpo = extraer_cuerpo(payload)
    assert cuerpo.origen == "text/html"
    assert "Boletín" in cuerpo.texto and "Primera nota" in cuerpo.texto
    assert "<" not in cuerpo.texto


def test_correo_simple_sin_partes():
    cuerpo = extraer_cuerpo(parte("text/plain", "hola"))
    assert cuerpo.texto == "hola"


def test_multipart_recursivo_encuentra_el_plano_del_fondo():
    # multipart/mixed > multipart/related > multipart/alternative > text/plain.
    # Quedarse en el primer nivel —el error clásico— devolvería vacío.
    payload = parte(
        "multipart/mixed",
        partes=[
            parte(
                "multipart/related",
                partes=[
                    parte(
                        "multipart/alternative",
                        partes=[
                            parte("text/html", "<p>html profundo</p>"),
                            parte("text/plain", "plano profundo"),
                        ],
                    )
                ],
            ),
            parte("application/pdf", filename="boletin.pdf"),
        ],
    )
    cuerpo = extraer_cuerpo(payload)
    assert cuerpo.texto == "plano profundo"
    assert cuerpo.adjuntos == ("boletin.pdf",)


def test_un_adjunto_de_texto_no_se_confunde_con_el_cuerpo():
    payload = parte(
        "multipart/mixed",
        partes=[
            parte("text/plain", "SOY UN ADJUNTO", filename="notas.txt"),
            parte("text/plain", "soy el cuerpo"),
        ],
    )
    cuerpo = extraer_cuerpo(payload)
    assert cuerpo.texto == "soy el cuerpo"
    assert cuerpo.adjuntos == ("notas.txt",)


def test_un_correo_sin_texto_no_revienta():
    cuerpo = extraer_cuerpo(parte("multipart/mixed", partes=[parte("image/png", filename="f.png")]))
    assert cuerpo.texto == "" and cuerpo.origen == ""


def test_payload_vacio():
    assert extraer_cuerpo({}).texto == ""


# --- HTML a texto ------------------------------------------------------------


def test_descarta_script_y_style():
    html = "<style>.a{color:red}</style><script>var x=1</script><p>visible</p>"
    assert html_a_texto(html) == "visible"


def test_resuelve_entidades_y_nbsp():
    assert html_a_texto("<p>Corporaci&oacute;n&nbsp;Nacional</p>") == "Corporación Nacional"


def test_las_celdas_de_tabla_no_se_pegan_entre_si():
    # El boletín real son tablas anidadas: sin separador, los titulares salen concatenados.
    texto = html_a_texto("<table><tr><td>Titular uno</td><td>Titular dos</td></tr></table>")
    assert "Titular unoTitular dos" not in texto
    assert "Titular uno" in texto and "Titular dos" in texto


def test_html_roto_no_lanza():
    assert "algo" in html_a_texto("<p>algo<div><span>sin cerrar")
