"""Las cuatro ramas de la escritura, con una conexión de mentira.

NO se prueba el SQL contra Postgres: en esta máquina no hay ninguno, y decir que algo está
verificado cuando no se ejecutó sería mentir. Lo que sí se prueba es la DECISIÓN —qué
sentencia se manda en cada caso—, que es donde está la regla de negocio y donde puede
romperse en silencio.

La rama que importa es «hay una corrección manual»: si esa se rompe, el servicio revierte
cada hora lo que un administrador acaba de arreglar, y el síntoma que ve la gente es que
el enlace «vuelve solo» al valor malo.
"""
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.repositorio import ORIGEN, Repositorio  # noqa: E402


@dataclass(frozen=True)
class BoletinFalso:
    fecha: date
    url: str
    documento_id: str
    mensaje_id: str = "msg-1"


def boletin(documento="2754012", dia=26):
    return BoletinFalso(
        fecha=date(2026, 8, dia),
        url=f"https://mediastation.simbiu.es/Documents/Download/{documento}",
        documento_id=documento,
    )


class CursorFalso:
    def __init__(self, existente):
        self._existente = existente
        self.sentencias = []

    def execute(self, sentencia, parametros=None):
        self.sentencias.append((sentencia.strip().split()[0].upper(), parametros))

    def fetchone(self):
        return self._existente

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class ConexionFalsa:
    def __init__(self, existente=None):
        self.cursor_falso = CursorFalso(existente)
        self.commit_hecho = False
        self.cerrada = False

    def cursor(self):
        return self.cursor_falso

    # `with conexion` en psycopg2 es la transacción, no el cierre.
    def __enter__(self):
        return self

    def __exit__(self, tipo, *_):
        self.commit_hecho = tipo is None
        return False

    def close(self):
        self.cerrada = True


def repositorio_con(existente=None):
    conexion = ConexionFalsa(existente)
    return Repositorio({}, conectar=lambda _c: conexion), conexion


def verbos(conexion):
    return [verbo for verbo, _ in conexion.cursor_falso.sentencias]


def test_sin_fila_previa_inserta():
    repo, conexion = repositorio_con(existente=None)
    with repo:
        resultado = repo.guardar([boletin()])

    assert verbos(conexion) == ["SELECT", "INSERT"]
    assert (resultado.insertados, resultado.actualizados) == (1, 0)


def test_una_correccion_manual_no_se_pisa():
    # LA prueba de este módulo. Un admin arregló el enlace del día: el servicio consulta,
    # ve origen='manual' y NO manda ningún UPDATE.
    repo, conexion = repositorio_con(
        existente=("https://mediastation.simbiu.es/Documents/Download/999", "999", "manual")
    )
    with repo:
        resultado = repo.guardar([boletin("2754012")])

    assert verbos(conexion) == ["SELECT"], "no debe escribir nada"
    assert resultado.respetados == 1
    assert resultado.actualizados == 0


def test_una_fila_propia_con_otro_documento_se_corrige():
    repo, conexion = repositorio_con(
        existente=("https://mediastation.simbiu.es/Documents/Download/999", "999", ORIGEN)
    )
    with repo:
        resultado = repo.guardar([boletin("2754012")])

    assert verbos(conexion) == ["SELECT", "UPDATE"]
    assert resultado.actualizados == 1


def test_releer_el_mismo_correo_es_idempotente():
    # Es lo que pasa en cada revisión horaria: el mismo boletín una y otra vez.
    b = boletin()
    repo, conexion = repositorio_con(existente=(b.url, b.documento_id, ORIGEN))
    with repo:
        resultado = repo.guardar([b])

    assert verbos(conexion) == ["SELECT"], "no debe escribir si nada cambió"
    assert resultado.sin_cambio == 1


def test_la_transaccion_se_confirma_y_la_conexion_se_cierra():
    repo, conexion = repositorio_con(existente=None)
    with repo:
        repo.guardar([boletin()])
    assert conexion.commit_hecho is True
    assert conexion.cerrada is True


def test_sin_boletines_no_toca_la_base():
    repo, conexion = repositorio_con(existente=None)
    with repo:
        resultado = repo.guardar([])
    assert verbos(conexion) == []
    assert str(resultado).startswith("0 nuevo(s)")


def test_el_update_lleva_el_cerrojo_de_origen():
    # Defensa en profundidad: aunque la rama de Python fallara, la sentencia no puede
    # tocar una fila manual.
    from app.repositorio import _UPDATE

    assert "origen = 'correo'" in _UPDATE


def test_el_insert_no_inventa_el_origen():
    from app.repositorio import _INSERT

    assert "%(origen)s" in _INSERT
    assert ORIGEN == "correo"
