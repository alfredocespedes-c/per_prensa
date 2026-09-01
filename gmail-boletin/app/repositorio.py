"""Escritura en Postgres: la tabla `boletines_contratados` de COIPO_PRENSA.

Este servicio es un SUMIDERO: escribe el enlace detectado y no lee nada más. El esquema lo
aplican el collector y el backend (db/schema.sql); acá NO se crea ni se altera ninguna
tabla — un tercer proceso aplicando el mismo DDL es una carrera esperando a ocurrir.

LA REGLA QUE MÁS IMPORTA — una corrección manual no se pisa:

  Si un administrador corrigió a mano el enlace de un día (porque el correo traía uno
  equivocado, o porque el boletín llegó por otra vía), la lectura del buzón NO puede
  revertirlo. Sin esa condición, el ciclo siguiente pisaría la corrección y nadie
  entendería por qué el enlace «vuelve solo» al valor malo. Es el mismo error que ya está
  documentado en CLAUDE.md para `archivarSecciones` y el orden que arrastra el admin: un
  proceso periódico jamás debe deshacer una decisión humana.

POR QUÉ CONSULTA PRIMERO Y LUEGO DECIDE, en vez de un ON CONFLICT con WHERE:

  La versión anterior distinguía alta de corrección con `RETURNING (xmax = 0)`. Ese truco
  funciona, pero depende de un detalle interno de Postgres, no se puede leer de un vistazo
  y —lo decisivo— no había forma de comprobarlo acá: en esta máquina no hay Postgres. Un
  SELECT y tres ramas explícitas hacen lo mismo, se entienden solas y se prueban con una
  conexión de mentira. El volumen es de un puñado de filas por corrida, así que el viaje
  de más no cuesta nada.

  El índice único (proveedor, fecha) sigue siendo el árbitro real si alguna vez corrieran
  dos instancias a la vez: la ventana entre el SELECT y el INSERT daría un IntegrityError,
  que se registra y no rompe la corrida.
"""
import logging
from dataclasses import dataclass

from .errores import ErrorRed

logger = logging.getLogger(__name__)

PROVEEDOR = "simbiu"
ORIGEN = "correo"

_SELECT = """
SELECT url, documento_id, origen
  FROM boletines_contratados
 WHERE proveedor = %(proveedor)s AND fecha = %(fecha)s
"""

_INSERT = """
INSERT INTO boletines_contratados
    (proveedor, fecha, url, documento_id, origen,
     registrado_en, registrado_por, registrado_sub, actualizado_en, actualizado_por)
VALUES
    (%(proveedor)s, %(fecha)s, %(url)s, %(documento_id)s, %(origen)s,
     now(), %(actor)s, %(mensaje_id)s, now(), %(actor)s)
"""

_UPDATE = """
UPDATE boletines_contratados
   SET url = %(url)s,
       documento_id = %(documento_id)s,
       origen = %(origen)s,
       registrado_sub = %(mensaje_id)s,
       actualizado_en = now(),
       actualizado_por = %(actor)s
 WHERE proveedor = %(proveedor)s
   AND fecha = %(fecha)s
   -- El cerrojo: solo se pisa lo que puso este mismo proceso.
   AND origen = 'correo'
"""


@dataclass(frozen=True)
class Resultado:
    insertados: int = 0
    actualizados: int = 0
    sin_cambio: int = 0
    respetados: int = 0  # los que tenían corrección manual y no se tocaron

    def __str__(self) -> str:
        partes = [
            f"{self.insertados} nuevo(s)",
            f"{self.actualizados} corregido(s)",
            f"{self.sin_cambio} sin cambio",
        ]
        if self.respetados:
            partes.append(f"{self.respetados} con corrección manual respetada")
        return ", ".join(partes)


def _conectar_psycopg2(configuracion: dict):
    """Fábrica por defecto. Se importa aquí dentro para que el módulo se pueda importar
    (y probar) sin tener psycopg2 instalado."""
    import psycopg2

    try:
        return psycopg2.connect(**configuracion)
    except psycopg2.OperationalError as error:
        # El mensaje de psycopg2 incluye host y usuario, nunca la contraseña; aun así se
        # resume para no volcar la cadena de conexión al log.
        raise ErrorRed(
            "No se pudo conectar a Postgres. Revise DATABASE_HOST/PORT/NAME/USER y que el "
            "contenedor alcance la base."
        ) from error


class Repositorio:
    """Conexión de vida corta: se abre para escribir la tanda y se cierra.

    `conectar` se inyecta para poder probar las tres ramas de decisión sin una base.
    """

    def __init__(self, configuracion: dict, actor: str = "gmail-boletin", conectar=None) -> None:
        self._configuracion = configuracion
        self._actor = actor
        self._conectar = conectar or _conectar_psycopg2
        self._conexion = None

    def __enter__(self):
        self._conexion = self._conectar(self._configuracion)
        return self

    def __exit__(self, *_excepcion):
        try:
            if self._conexion is not None:
                self._conexion.close()
        except Exception:  # noqa: BLE001 - cerrar nunca debe tumbar el proceso
            pass
        return False

    def guardar(self, boletines) -> Resultado:
        insertados = actualizados = sin_cambio = respetados = 0

        # `with conexion` en psycopg2 es la TRANSACCIÓN (no cierra la conexión): commit al
        # salir bien, rollback si algo lanza.
        with self._conexion:
            with self._conexion.cursor() as cursor:
                for boletin in boletines:
                    parametros = {
                        "proveedor": PROVEEDOR,
                        "fecha": boletin.fecha,
                        "url": boletin.url,
                        "documento_id": boletin.documento_id,
                        "origen": ORIGEN,
                        "actor": self._actor,
                        "mensaje_id": boletin.mensaje_id,
                    }
                    cursor.execute(_SELECT, parametros)
                    existente = cursor.fetchone()

                    if existente is None:
                        cursor.execute(_INSERT, parametros)
                        insertados += 1
                        logger.info(
                            "Boletín del %s registrado (documento %s).",
                            boletin.fecha, boletin.documento_id,
                        )
                        continue

                    url, documento_id, origen = existente[0], existente[1], existente[2]
                    if origen != ORIGEN:
                        respetados += 1
                        logger.info(
                            "Boletín del %s: hay una corrección manual, no se toca.",
                            boletin.fecha,
                        )
                        continue
                    if url == boletin.url and documento_id == boletin.documento_id:
                        sin_cambio += 1
                        continue

                    cursor.execute(_UPDATE, parametros)
                    actualizados += 1
                    logger.info(
                        "Boletín del %s corregido: documento %s -> %s.",
                        boletin.fecha, documento_id, boletin.documento_id,
                    )

        return Resultado(insertados, actualizados, sin_cambio, respetados)

    # --- Noticias dentro del boletín -----------------------------------------

    def id_y_noticias(self, fecha) -> tuple[int | None, int]:
        """(id del boletín de esa fecha, cuántas noticias tiene). (None, 0) si no existe.

        Sirve para decidir si hace falta descargar y parsear el documento: si el boletín
        ya tiene sus noticias, volver a bajar 478 KB en cada revisión sería gastar red y
        cuota del proveedor para reescribir lo mismo.
        """
        with self._conexion.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM boletines_contratados WHERE proveedor = %s AND fecha = %s",
                (PROVEEDOR, fecha),
            )
            fila = cursor.fetchone()
            if fila is None:
                return None, 0
            cursor.execute(
                "SELECT count(*) FROM boletin_contratado_noticias WHERE boletin_id = %s",
                (fila[0],),
            )
            return fila[0], cursor.fetchone()[0]

    def guardar_noticias(self, boletin_id: int, noticias) -> int:
        """Reemplaza por completo las noticias de un boletín. Devuelve cuántas quedaron.

        BORRA Y VUELVE A INSERTAR en vez de hacer upsert por (boletin_id, orden): si el
        proveedor reedita el boletín con MENOS noticias, un upsert dejaría colgando las
        sobrantes del intento anterior y el boletín mostraría noticias que ya no están.
        Todo dentro de la misma transacción, así que nunca se ve un estado a medias.
        """
        with self._conexion:
            with self._conexion.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM boletin_contratado_noticias WHERE boletin_id = %s",
                    (boletin_id,),
                )
                for n in noticias:
                    cursor.execute(
                        """
                        INSERT INTO boletin_contratado_noticias
                            (boletin_id, orden, concepto, tipo, ambito,
                             titular, medio, fecha, pagina, url)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (boletin_id, n.orden, n.concepto, n.tipo, n.ambito,
                         n.titular, n.medio, n.fecha, n.pagina, n.url),
                    )
        logger.info("Boletín %s: %d noticias guardadas.", boletin_id, len(noticias))
        return len(noticias)
