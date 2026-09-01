"""Fixtures de tests del backend: cero Postgres y cero IAM.

La sesión falsa de BD interpreta las expresiones reales de SQLAlchemy que emiten
los routers (filter con ==/>=/<=/is_(), order_by con desc()/nullslast(),
offset/limit, y el patrón subquery+join de /api/noticias), así los tests
ejercitan la lógica de consulta de verdad — filtros, orden, ventana y
paginación — sin abrir una conexión.

La autenticación (v3, patrón BFF) se falsifica por dependency_overrides:
`cliente_con(bd, sesion='general'|'admin')` monta una Sesion ya validada;
sin `sesion`, el cliente es anónimo (cookie ausente → el guard real responde 401
en las rutas protegidas, que es parte de lo que se testea).

El TestClient se usa SIN context manager a propósito: el lifespan de app.main
(bootstrap del esquema) requiere la BD y no debe correr en CI.
"""
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.dependencias import Sesion, obtener_sesion, sesion_opcional
from app.main import app


def _columna_y_flags(expresion):
    """Desenrolla Column / desc() / nullslast() a (nombre, descendente, nulls_last)."""
    descendente = False
    nulls_last = False
    actual = expresion
    while hasattr(actual, "element"):
        modificador = getattr(actual, "modifier", None)
        nombre_mod = getattr(modificador, "__name__", "")
        if "desc" in nombre_mod:
            descendente = True
        if "nullslast" in nombre_mod or "nulls_last" in nombre_mod:
            nulls_last = True
        actual = actual.element
    return actual.key, descendente, nulls_last


def _valor_derecho(derecho):
    if hasattr(derecho, "value"):
        return derecho.value
    # in_()/notin_() con una colección literal: SQLAlchemy la envuelve en una lista de
    # BindParameter dentro de `.clauses` en vez de un único `.value`.
    if hasattr(derecho, "clauses"):
        return [_valor_derecho(c) for c in derecho.clauses]
    # Constantes SQL sin .value: is_(False) / is_(True) / is_(None).
    tipo = type(derecho).__name__.lower()
    return {"false_": False, "true_": True, "null": None}.get(tipo)


def _operador(expresion):
    nombre = getattr(expresion.operator, "__name__", "")
    if nombre == "is_":
        return lambda a, b: a is b or a == b
    if nombre in ("is_not", "isnot"):
        return lambda a, b: not (a is b or a == b)
    # El filtro de retiros usa NOT IN sobre columnas indexadas (ver
    # app/servicios/retiros.py).
    if nombre in ("in_op", "in_"):
        return lambda a, b: a in (b or [])
    if nombre in ("not_in_op", "notin_op", "notin_", "not_in"):
        return lambda a, b: a not in (b or [])
    return expresion.operator  # ==, >=, <= son funciones del módulo operator


class ConsultaFalsa:
    def __init__(self, filas):
        self._filas = list(filas)

    def filter(self, *expresiones):
        # SQLAlchemy permite `filter(a, b)` como AND. El fake lo aplica en cadena, que es
        # equivalente y evita duplicar la lógica de evaluación.
        consulta = self
        for expresion in expresiones:
            consulta = consulta._filtrar_una(expresion)
        return consulta

    def _filtrar_una(self, expresion):
        columna = expresion.left.key
        valor = _valor_derecho(expresion.right)
        op = _operador(expresion)
        # NOT IN debe conservar las filas cuya columna sea None (un NULL no está en la
        # lista), al revés que los operadores de comparación, donde una columna vacía no
        # puede satisfacer el predicado.
        nombre_op = getattr(expresion.operator, "__name__", "")
        conserva_nulos = nombre_op in ("not_in_op", "notin_op", "notin_", "not_in")
        return ConsultaFalsa(
            fila
            for fila in self._filas
            if (conserva_nulos and getattr(fila, columna, None) is None)
            or (getattr(fila, columna, None) is not None and op(getattr(fila, columna), valor))
        )

    def order_by(self, *expresiones):
        filas = list(self._filas)
        # Orden estable multi-clave: se aplica de la última clave a la primera.
        for expresion in reversed(expresiones):
            columna, descendente, nulls_last = _columna_y_flags(expresion)
            con_valor = [f for f in filas if getattr(f, columna) is not None]
            sin_valor = [f for f in filas if getattr(f, columna) is None]
            con_valor.sort(key=lambda f: getattr(f, columna), reverse=descendente)
            filas = con_valor + sin_valor if (nulls_last or not descendente) else sin_valor + con_valor
        return ConsultaFalsa(filas)

    def offset(self, n):
        return ConsultaFalsa(self._filas[n:])

    def limit(self, n):
        return ConsultaFalsa(self._filas[:n])

    def subquery(self):
        # /api/noticias materializa la ventana (LIMIT) como subquery y luego re-consulta
        # con join. En el fake, la "subquery" es simplemente el conjunto de filas ya
        # ordenado y recortado; `.c` existe solo para que el router pueda construir la
        # condición del join (que el join falso ignora: cruza por id).
        self.c = SimpleNamespace(id=None)
        return self

    def join(self, sub, _condicion):
        ids = {fila.id for fila in sub._filas}
        return ConsultaFalsa(fila for fila in self._filas if fila.id in ids)

    def count(self):
        return len(self._filas)

    def all(self):
        return list(self._filas)


class SesionFalsa:
    def __init__(
        self,
        noticias=(),
        secciones=(),
        metadatos=None,
        falla_conexion=False,
        retiros=(),
        boletines=(),
        boletin_noticias=(),
    ):
        self._por_modelo = {
            "noticias": list(noticias),
            "secciones": list(secciones),
            "retiros": list(retiros),
            "boletines_contratados": list(boletines),
            "boletin_contratado_noticias": list(boletin_noticias),
        }
        self._metadatos = metadatos
        self._falla_conexion = falla_conexion

    def query(self, entidad):
        # Admite query(Modelo) y query(Modelo.columna) (p. ej. query(Noticia.id)).
        modelo = getattr(entidad, "class_", entidad)
        return ConsultaFalsa(self._por_modelo.get(modelo.__tablename__, []))

    def get(self, modelo, clave):
        if self._falla_conexion:
            raise RuntimeError("host=secreto user=secreto: conexión rechazada")
        return self._metadatos

    def execute(self, _sentencia, _parametros=None):
        # `_parametros` porque servicios/auditoria.py llama execute(sentencia, valores).
        # Sin él, cada registro de auditoría caía en su try/except y ensuciaba la salida
        # de los tests con "No se pudo registrar el evento" — ruido que enmascara fallos
        # de verdad.
        if self._falla_conexion:
            raise RuntimeError("host=secreto user=secreto: conexión rechazada")
        return SimpleNamespace()

    # --- Escritura --------------------------------------------------------------
    # Mínimo para los endpoints que INSERTAN (POST /api/retiros). No se pretende emular
    # una unidad de trabajo: la fila se agrega a la colección de su tabla y queda visible
    # para las consultas siguientes, que es lo que los tests necesitan observar.

    def add(self, objeto):
        tabla = getattr(type(objeto), "__tablename__", None)
        if tabla is None:
            raise AssertionError(f"add() con un objeto sin tabla: {objeto!r}")
        filas = self._por_modelo.setdefault(tabla, [])
        if getattr(objeto, "id", None) is None:
            # BIGSERIAL: la base asigna el id. Sin esto, `_salida` devolvería id=None y
            # el schema de respuesta fallaría por un motivo que no es el que se prueba.
            objeto.id = len(filas) + 1
        filas.append(objeto)

    def commit(self):
        return None

    def rollback(self):
        return None

    def refresh(self, _objeto):
        return None

    def delete(self, objeto):
        # Se busca la lista que REALMENTE contiene el objeto, y se compara por identidad
        # y no por id: las filas del fake son SimpleNamespace, no instancias del modelo,
        # y en los tests de supresión el objeto borrado es exactamente el que devolvió la
        # consulta.
        #
        # Antes esto resolvía la tabla con type(objeto).__tablename__, que en un
        # SimpleNamespace no existe: delete() era un NO-OP silencioso sobre cualquier fila
        # de fixture y además dejaba una clave None en _por_modelo. El test de supresión
        # de datos personales pasaba igual, pero por el motivo equivocado — las filas
        # desaparecían de /api/noticias por el filtro de retiros, no por haberse borrado.
        for tabla, filas in self._por_modelo.items():
            if any(f is objeto for f in filas):
                self._por_modelo[tabla] = [f for f in filas if f is not objeto]
                return
        # Instancias reales del modelo (las que inserta add()) que aún no estén en ninguna
        # lista: se cae al nombre de tabla declarado.
        tabla = getattr(type(objeto), "__tablename__", None)
        if tabla is not None:
            filas = self._por_modelo.get(tabla, [])
            self._por_modelo[tabla] = [f for f in filas if f is not objeto]


def fila_noticia(**sobrescribe):
    """Fila `noticias` como la deja el archivador del collector (snake_case)."""
    base = dict(
        id="https://mediouno.cl/nota-1",
        url="https://mediouno.cl/nota-1",
        medio_id="medio-uno",
        medio_nombre="Medio Uno",
        seccion_id="digital",
        titular="CONAF anuncia plan de manejo",
        fecha=datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc),
        fecha_deteccion=datetime(2026, 8, 1, 13, 0, tzinfo=timezone.utc),
        extracto=[{"texto": "CONAF", "resaltado": True}],
        # Sin `imagen`: la columna se eliminó de `noticias`. El test que comprueba que
        # ninguna superficie la entregue la añade a mano, para simular justamente el caso
        # de que alguien la reintroduzca.
        autor=None,
        fecha_real=None,
        event_id=None,
        analisis=None,
        excluida=False,
        excluida_por=[],
        # Nivel 1 de la jerarquía del boletín (ver collector/src/dominio/inclusiones.js).
        conceptos_detectados=["CONAF"],
        concepto_principal="CONAF",
    )
    base.update(sobrescribe)
    return SimpleNamespace(**base)


def fila_retiro(**sobrescribe):
    """Fila `retiros`. Por defecto una solicitud PENDIENTE, que no filtra nada."""
    base = dict(
        id=1,
        ambito="noticia",
        clave="https://mediouno.cl/nota-1",
        motivo=None,
        solicitante="Jefatura de prensa",
        contacto="prensa@mediouno.cl",
        estado="pendiente",
        creado_en=datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc),
        ip_origen=None,
        aplicado_en=None,
        aplicado_por=None,
    )
    base.update(sobrescribe)
    return SimpleNamespace(**base)


def fila_boletin_contratado(**sobrescribe):
    """Fila `boletines_contratados`: el ENLACE al boletín del servicio contratado.

    Nada del contenido — la tabla no tiene dónde guardarlo, y el test
    `test_la_respuesta_no_lleva_nada_del_contenido` es el que lo mantiene así.
    """
    base = dict(
        id=1,
        proveedor="simbiu",
        fecha=date(2026, 8, 26),
        url="https://mediastation.simbiu.es/Documents/Download/2754012",
        documento_id="2754012",
        origen="manual",
        registrado_en=datetime(2026, 8, 26, 11, 30, tzinfo=timezone.utc),
        registrado_por="lmonsalve",
        registrado_sub="u-1",
        ip_origen=None,
        actualizado_en=datetime(2026, 8, 26, 11, 30, tzinfo=timezone.utc),
        actualizado_por="lmonsalve",
    )
    base.update(sobrescribe)
    return SimpleNamespace(**base)


def fila_boletin_noticia(**sobrescribe):
    """Fila `boletin_contratado_noticias`: una noticia DENTRO del boletín contratado.

    Sin extracto a propósito: la tabla no tiene dónde ponerlo y el test
    `test_el_desglose_no_lleva_texto_del_medio` es lo que lo mantiene así.
    """
    base = dict(
        id=1,
        boletin_id=1,
        orden=0,
        concepto="CONAF",
        tipo="Impresos",
        ambito="Santiago",
        titular="CONAF decreta cierre preventivo de Parque Nacional Morro Moreno",
        medio="EL MERCURIO (C)",
        fecha=date(2026, 8, 26),
        pagina="5",
        url="https://mediastation.simbiu.es/files/index/1/1/PressRecorte/2026-08-26/file.pdf/9",
    )
    base.update(sobrescribe)
    return SimpleNamespace(**base)


def fila_metadatos(**sobrescribe):
    base = dict(
        id=1,
        generado_en=datetime(2026, 8, 1, 13, 5, tzinfo=timezone.utc),
        tamano_ventana=1000,
        actualizado_en=datetime(2026, 8, 1, 13, 5, tzinfo=timezone.utc),
    )
    base.update(sobrescribe)
    return SimpleNamespace(**base)


def _sesion_bff(rol):
    return Sesion(
        sub="u-1",
        usuario="usuaria",
        email="usuaria@conaf.cl",
        rol=rol,
        app_id=1,
        iniciada_en=1_700_000_000,
        expira_en=4_100_000_000,
    )


@pytest.fixture
def cliente_con():
    """Factory: cliente_con(bd, sesion=None|'general'|'admin') → TestClient.

    Sin `sesion` el cliente es anónimo: las rutas públicas responden y las
    protegidas devuelven el 401 del guard real.
    """

    def _factory(bd, sesion=None):
        def _get_db_falso():
            yield bd

        app.dependency_overrides[get_db] = _get_db_falso
        if sesion is not None:
            sesion_valida = _sesion_bff(sesion)
            app.dependency_overrides[obtener_sesion] = lambda: sesion_valida
            app.dependency_overrides[sesion_opcional] = lambda: sesion_valida
        return TestClient(app)

    yield _factory
    app.dependency_overrides.clear()
