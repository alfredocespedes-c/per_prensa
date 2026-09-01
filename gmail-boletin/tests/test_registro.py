"""Que ningún secreto salga por el log. Es el requisito de seguridad de la aplicación.

EL CASO QUE IMPORTA es el tercero: un secreto dentro del mensaje de una EXCEPCIÓN. Un
`logging.Filter` no puede taparlo —corre antes de que exista el traceback— y la primera
versión de este módulo tenía justamente ese agujero: los dos primeros casos pasaban y el
tercero imprimía el refresh token entero. Por eso la redacción vive en el formateador.
"""
import io
import logging
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.registro import FiltroSecretos, FormateadorSeguro  # noqa: E402

CLIENT_SECRET = "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a"
REFRESH_TOKEN = "1//0-refresh-token-de-mentira-largo-para-la-prueba"
SECRETOS = sorted({CLIENT_SECRET, REFRESH_TOKEN}, key=len, reverse=True)


@pytest.fixture
def log_y_buffer():
    buffer = io.StringIO()
    manejador = logging.StreamHandler(buffer)
    manejador.setFormatter(FormateadorSeguro("%(message)s", secretos=SECRETOS))
    manejador.addFilter(FiltroSecretos(SECRETOS))

    registrador = logging.getLogger("prueba-redaccion")
    registrador.handlers.clear()
    registrador.addHandler(manejador)
    registrador.setLevel(logging.DEBUG)
    registrador.propagate = False
    yield registrador, buffer
    registrador.handlers.clear()


def test_redacta_el_secreto_del_mensaje(log_y_buffer):
    log, buffer = log_y_buffer
    log.error("fallo con %s", CLIENT_SECRET)
    assert CLIENT_SECRET not in buffer.getvalue()


def test_redacta_el_secreto_de_un_argumento(log_y_buffer):
    # La trampa: si solo se limpiara `msg`, formatear después reintroduciría el arg.
    log, buffer = log_y_buffer
    log.warning("token=%s", REFRESH_TOKEN)
    assert REFRESH_TOKEN not in buffer.getvalue()


def test_redacta_el_secreto_dentro_de_un_traceback(log_y_buffer):
    # La regresión de verdad: así es como una librería de terceros filtra un secreto.
    log, buffer = log_y_buffer
    try:
        raise RuntimeError(
            f"la API respondió: client_secret={CLIENT_SECRET}&refresh_token={REFRESH_TOKEN}"
        )
    except RuntimeError:
        log.exception("error propagado")

    salida = buffer.getvalue()
    assert "Traceback" in salida, "el traceback debe seguir imprimiéndose"
    assert CLIENT_SECRET not in salida
    assert REFRESH_TOKEN not in salida
    assert "***REDACTADO***" in salida


def test_el_mensaje_util_sobrevive_a_la_redaccion(log_y_buffer):
    # Redactar no puede convertir el log en algo inservible para diagnosticar.
    log, buffer = log_y_buffer
    log.error("no se pudo renovar el token para %s", CLIENT_SECRET)
    assert "no se pudo renovar el token" in buffer.getvalue()


def test_sin_secretos_configurados_no_altera_nada(log_y_buffer):
    manejador = logging.StreamHandler(io.StringIO())
    manejador.setFormatter(FormateadorSeguro("%(message)s", secretos=[]))
    assert manejador.formatter.format(
        logging.LogRecord("x", logging.INFO, "f", 1, "texto tal cual", None, None)
    ) == "texto tal cual"
