"""/health: conectividad + antigüedad de la última colecta (base de la alerta
de "collector caído" — cron horario, umbral ~90 min). v3: además reporta los
NOMBRES de las variables de autenticación faltantes (nunca el motivo, SEC-07)."""
from datetime import datetime, timedelta, timezone

from app import config

from tests.conftest import SesionFalsa, fila_metadatos


def test_salud_ok_reporta_minutos_desde_la_ultima_colecta(cliente_con, monkeypatch):
    monkeypatch.setattr(config, "FALTANTES", [])
    hace_10_min = datetime.now(timezone.utc) - timedelta(minutes=10)
    cliente = cliente_con(SesionFalsa(metadatos=fila_metadatos(actualizado_en=hace_10_min)))

    respuesta = cliente.get("/health")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "ok"
    assert cuerpo["db"] == "ok"
    assert 9 < cuerpo["minutosDesdeUltimaColecta"] < 11


def test_salud_sin_colectas_todavia_responde_ok_con_nulos(cliente_con, monkeypatch):
    # Base recién bootstrapeada, antes de la primera corrida del collector.
    monkeypatch.setattr(config, "FALTANTES", [])
    cliente = cliente_con(SesionFalsa(metadatos=None))

    cuerpo = cliente.get("/health").json()

    assert cuerpo["status"] == "ok"
    assert cuerpo["ultimaColecta"] is None
    assert cuerpo["minutosDesdeUltimaColecta"] is None


def test_salud_degradado_lista_las_variables_de_auth_faltantes(cliente_con, monkeypatch):
    # Despliegue incompleto: responde 200 (el healthcheck de compose no debe tumbar
    # el stack) pero delata QUÉ variables faltan — nombres, jamás motivos ni valores.
    monkeypatch.setattr(config, "FALTANTES", ["IAM_URL", "SESSION_SECRET"])
    cliente = cliente_con(SesionFalsa(metadatos=None))

    cuerpo = cliente.get("/health").json()

    assert cuerpo["status"] == "degradado"
    assert cuerpo["db"] == "ok"
    assert cuerpo["configuracion"] == ["IAM_URL", "SESSION_SECRET"]


def test_salud_con_bd_caida_no_filtra_detalles_de_conexion(cliente_con, monkeypatch):
    # SEC-07: el detalle de la excepción (host/usuario/BD) se queda en el log
    # del servidor; el cliente solo ve un estado genérico.
    monkeypatch.setattr(config, "FALTANTES", [])
    cliente = cliente_con(SesionFalsa(falla_conexion=True))

    respuesta = cliente.get("/health")

    assert respuesta.status_code == 200
    assert respuesta.json() == {
        "status": "error",
        "db": "error",
        "ultimaColecta": None,
        "minutosDesdeUltimaColecta": None,
        "configuracion": None,
    }
    assert "secreto" not in respuesta.text
